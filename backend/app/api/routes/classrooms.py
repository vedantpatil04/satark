import secrets
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.core.dependencies import get_current_user, require_teacher
from backend.app.models import User, Classroom, ClassroomEnrollment, Notification
from backend.app.schemas import (
    ClassroomCreate, ClassroomResponse, ClassroomJoinRequest, EnrolledStudentResponse,
    ClassroomAnnouncementCreate, ClassroomAnnouncementResponse
)
from backend.app.services.audit_service import log_action
from backend.app.websocket.manager import ws_manager

router = APIRouter(prefix="/classrooms", tags=["Classrooms"])


def generate_join_code() -> str:
    return secrets.token_hex(3).upper()  # 6-character hex code e.g. "A8F9B2"


@router.post("", response_model=ClassroomResponse, status_code=status.HTTP_201_CREATED)
def create_classroom(
    req: ClassroomCreate,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    join_code = generate_join_code()
    # Guarantee uniqueness
    while db.query(Classroom).filter(Classroom.join_code == join_code).first():
        join_code = generate_join_code()

    classroom = Classroom(
        teacher_id=current_user.id,
        title=req.title.strip(),
        subject_code=req.subject_code.strip() if req.subject_code else None,
        description=req.description.strip() if req.description else None,
        join_code=join_code,
        is_archived=False
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="CLASSROOM_CREATED",
        actor_user_id=current_user.id,
        target_resource=classroom.id,
        ip_address=client_ip,
        details={"title": classroom.title, "join_code": classroom.join_code}
    )

    resp = ClassroomResponse.model_validate(classroom)
    resp.enrolled_count = 0
    return resp


@router.get("", response_model=List[ClassroomResponse])
def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    results = []
    if current_user.role == "teacher":
        classrooms = db.query(Classroom).filter(
            Classroom.teacher_id == current_user.id,
            Classroom.is_archived == False
        ).all()
        for c in classrooms:
            count = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == c.id).count()
            cr = ClassroomResponse.model_validate(c)
            cr.enrolled_count = count
            results.append(cr)
    else:
        # Enrolled classrooms for student
        enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.student_id == current_user.id).all()
        for e in enrollments:
            c = e.classroom
            if not c.is_archived:
                count = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == c.id).count()
                cr = ClassroomResponse.model_validate(c)
                cr.enrolled_count = count
                results.append(cr)
    return results


@router.get("/{classroom_id}", response_model=ClassroomResponse)
def get_classroom(
    classroom_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found"
        )

    # Authorization: teacher owner or enrolled student
    if current_user.role == "teacher":
        if classroom.teacher_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    else:
        enrollment = db.query(ClassroomEnrollment).filter(
            ClassroomEnrollment.classroom_id == classroom_id,
            ClassroomEnrollment.student_id == current_user.id
        ).first()
        if not enrollment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enrolled in this classroom")

    count = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == classroom.id).count()
    cr = ClassroomResponse.model_validate(classroom)
    cr.enrolled_count = count
    return cr


@router.post("/join", response_model=ClassroomResponse)
def join_classroom(
    req: ClassroomJoinRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only students can enroll in classrooms"
        )

    clean_code = req.join_code.strip().upper()
    classroom = db.query(Classroom).filter(Classroom.join_code == clean_code).first()
    if not classroom or classroom.is_archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired classroom join code"
        )

    existing_enrollment = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == classroom.id,
        ClassroomEnrollment.student_id == current_user.id
    ).first()
    if existing_enrollment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student is already enrolled in this classroom"
        )

    enrollment = ClassroomEnrollment(
        classroom_id=classroom.id,
        student_id=current_user.id
    )
    db.add(enrollment)
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="STUDENT_ENROLLED",
        actor_user_id=current_user.id,
        target_resource=classroom.id,
        ip_address=client_ip,
        details={"join_code": clean_code}
    )

    count = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == classroom.id).count()
    cr = ClassroomResponse.model_validate(classroom)
    cr.enrolled_count = count
    return cr


@router.get("/{classroom_id}/students", response_model=List[EnrolledStudentResponse])
def list_enrolled_students(
    classroom_id: str,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")

    if classroom.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == classroom_id).all()
    results = []
    for e in enrollments:
        student = e.student
        results.append(EnrolledStudentResponse(
            student_id=student.id,
            full_name=student.full_name,
            email=student.email,
            enrolled_at=e.enrolled_at
        ))
    return results


@router.post("/{classroom_id}/announcements", response_model=ClassroomAnnouncementResponse, status_code=status.HTTP_201_CREATED)
async def create_classroom_announcement(
    classroom_id: str,
    req: ClassroomAnnouncementCreate,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher sends an announcement to all students enrolled in a classroom.
    Creates persisted in-app notifications and broadcasts over WebSocket in real time.
    """
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
    if classroom.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    enrollments = db.query(ClassroomEnrollment).filter(ClassroomEnrollment.classroom_id == classroom_id).all()
    now = datetime.now(timezone.utc)

    # Persist notification for every enrolled student
    for e in enrollments:
        notif = Notification(
            user_id=e.student_id,
            title=f"Announcement: {classroom.title}",
            message=f"{req.title} - {req.message}",
            notification_type="announcement",
            is_read=False,
            created_at=now
        )
        db.add(notif)
    db.commit()

    # Broadcast real-time announcement to students
    await ws_manager.broadcast_to_students({
        "type": "classroom_announcement",
        "classroom_id": classroom.id,
        "classroom_title": classroom.title,
        "title": req.title,
        "message": req.message,
        "created_at": now.isoformat()
    })

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="CLASSROOM_ANNOUNCEMENT_SENT",
        actor_user_id=current_user.id,
        target_resource=classroom.id,
        ip_address=client_ip,
        details={"title": req.title, "recipients_count": len(enrollments)}
    )

    return ClassroomAnnouncementResponse(
        classroom_id=classroom.id,
        title=req.title,
        message=req.message,
        recipients_count=len(enrollments),
        created_at=now
    )


@router.delete("/{classroom_id}/students/{student_id}", status_code=status.HTTP_200_OK)
def remove_student_from_classroom(
    classroom_id: str,
    student_id: str,
    request: Request,
    current_user: User = Depends(require_teacher),
    db: Session = Depends(get_db)
):
    """
    Teacher removes an enrolled student from the classroom cohort.
    """
    classroom = db.query(Classroom).filter(Classroom.id == classroom_id).first()
    if not classroom:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classroom not found")
    if classroom.teacher_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    enrollment = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == classroom_id,
        ClassroomEnrollment.student_id == student_id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student is not enrolled in this classroom")

    db.delete(enrollment)
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="STUDENT_REMOVED_FROM_CLASSROOM",
        actor_user_id=current_user.id,
        target_resource=classroom_id,
        ip_address=client_ip,
        details={"removed_student_id": student_id}
    )

    return {"message": "Student successfully removed from classroom", "student_id": student_id}


@router.delete("/{classroom_id}/leave", status_code=status.HTTP_200_OK)
def leave_classroom(
    classroom_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Student leaves (unenrolls from) a classroom.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only students can leave classrooms")

    enrollment = db.query(ClassroomEnrollment).filter(
        ClassroomEnrollment.classroom_id == classroom_id,
        ClassroomEnrollment.student_id == current_user.id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not enrolled in this classroom")

    db.delete(enrollment)
    db.commit()

    client_ip = request.client.host if request.client else None
    log_action(
        db,
        action="STUDENT_LEFT_CLASSROOM",
        actor_user_id=current_user.id,
        target_resource=classroom_id,
        ip_address=client_ip
    )

    return {"message": "Successfully left the classroom", "classroom_id": classroom_id}

