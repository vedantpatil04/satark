import pytest
import uuid
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def get_auth_token(email: str, name: str) -> str:
    # Register or login
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "password123", "full_name": name, "role": "student"}
    )
    if reg_resp.status_code == 201:
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "password123"}
        )
        return login_resp.json()["access_token"]
    elif reg_resp.status_code == 400:
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "password123"}
        )
        return login_resp.json()["access_token"]
    raise RuntimeError(f"Auth failed: {reg_resp.text}")


def test_compiler_health_and_status():
    resp = client.get("/api/v1/compiler/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "runtimes" in data
    assert "isolation_info" in data
    assert "python" in data["runtimes"]
    assert "c" in data["runtimes"]
    assert "cpp" in data["runtimes"]
    assert "java" in data["runtimes"]

    # Verify Windows setup guides are included
    py_info = data["runtimes"]["python"]
    assert "setup_guide" in py_info or "setup_guide" in data["runtimes"]["c"]


def test_compiler_execute_python_with_stdin():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "language": "python",
        "code": "import sys\nval = sys.stdin.read().strip()\nprint(f'PYTHON_OK:{val}')\n",
        "stdin": "TEST_INPUT_123"
    }
    resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()
    assert res["status"] == "success"
    assert "PYTHON_OK:TEST_INPUT_123" in res["stdout"]
    assert res["execution_time_ms"] >= 0
    assert "process_isolation" in res["security_enforced"]


from backend.app.services.code_executor import detect_runtimes


def test_compiler_execute_c_with_stdin():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}
    runtimes = detect_runtimes()

    payload = {
        "language": "c",
        "code": """#include <stdio.h>
int main() {
    int a, b;
    if (scanf("%d %d", &a, &b) == 2) {
        printf("C_SUM:%d\\n", a + b);
    }
    return 0;
}
""",
        "stdin": "50 75"
    }
    resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()
    if runtimes["c"]["is_available"]:
        assert res["status"] == "success"
        assert "C_SUM:125" in res["stdout"]
    else:
        assert res["status"] == "unavailable"
        assert "unavailable" in res["stderr"].lower()


def test_compiler_execute_cpp_with_stdin():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}
    runtimes = detect_runtimes()

    payload = {
        "language": "cpp",
        "code": """#include <iostream>
#include <string>

int main() {
    std::string word;
    if (std::cin >> word) {
        std::cout << "CPP_ECHO:" << word << std::endl;
    }
    return 0;
}
""",
        "stdin": "SATARK_CPP"
    }
    resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()
    if runtimes["cpp"]["is_available"]:
        assert res["status"] == "success"
        assert "CPP_ECHO:SATARK_CPP" in res["stdout"]
    else:
        assert res["status"] == "unavailable"
        assert "unavailable" in res["stderr"].lower()


def test_compiler_execute_java_with_stdin():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}
    runtimes = detect_runtimes()

    payload = {
        "language": "java",
        "code": """import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNext()) {
            System.out.println("JAVA_OUTPUT:" + sc.next());
        }
        sc.close();
    }
}
""",
        "stdin": "JAVA_TEST_PASSED"
    }
    resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
    assert resp.status_code == 200
    res = resp.json()
    if runtimes["java"]["is_available"]:
        assert res["status"] == "success"
        assert "JAVA_OUTPUT:JAVA_TEST_PASSED" in res["stdout"]
    else:
        assert res["status"] == "unavailable"
        assert "unavailable" in res["stderr"].lower()


def test_compiler_compilation_error():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}
    runtimes = detect_runtimes()

    if runtimes["c"]["is_available"]:
        payload = {
            "language": "c",
            "code": "int main() { invalid_c_syntax_error! }"
        }
        resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
        assert resp.status_code == 200
        res = resp.json()
        assert res["status"] == "compilation_error"
        assert res["compilation_error"] is not None
    else:
        # Use Python syntax error to verify compilation/syntax error detection
        payload = {
            "language": "python",
            "code": "def broken_syntax(:\n    pass\n"
        }
        resp = client.post("/api/v1/compiler/execute", json=payload, headers=headers)
        assert resp.status_code == 200
        res = resp.json()
        assert res["status"] in ["compilation_error", "runtime_error"]
        assert "SyntaxError" in (res["stderr"] or res.get("compilation_error", ""))


def test_compiler_practice_files_management():
    token = get_auth_token("compiler_student1@example.com", "Student One")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetching files for python seeds default samples if empty
    list_resp = client.get("/api/v1/compiler/files?language=python", headers=headers)
    assert list_resp.status_code == 200
    files = list_resp.json()
    assert len(files) >= 1
    main_file = files[0]
    file_id = main_file["id"]

    # 2. Update/Autosave code
    update_resp = client.put(
        f"/api/v1/compiler/files/{file_id}",
        json={"code": "print('Updated code for autosave')", "stdin": "new_stdin"},
        headers=headers
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["code"] == "print('Updated code for autosave')"
    assert update_resp.json()["stdin"] == "new_stdin"

    # 3. Create a new practice file
    create_resp = client.post(
        "/api/v1/compiler/files",
        json={"language": "python", "filename": "custom_algo.py", "code": "# custom algorithm"},
        headers=headers
    )
    assert create_resp.status_code == 201
    new_id = create_resp.json()["id"]
    assert create_resp.json()["is_active"] is True

    # 4. Rename file
    rename_resp = client.put(
        f"/api/v1/compiler/files/{new_id}",
        json={"filename": "renamed_algo.py"},
        headers=headers
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["filename"] == "renamed_algo.py"

    # 5. Delete file
    del_resp = client.delete(f"/api/v1/compiler/files/{new_id}", headers=headers)
    assert del_resp.status_code == 204


def test_multiple_student_isolation():
    # Student A saves code
    token_a = get_auth_token("student_alpha@example.com", "Alpha Student")
    headers_a = {"Authorization": f"Bearer {token_a}"}

    client.post(
        "/api/v1/compiler/files",
        json={"language": "python", "filename": "alpha_secret.py", "code": "secret_alpha = 100"},
        headers=headers_a
    )

    # Student B logs in
    token_b = get_auth_token("student_beta@example.com", "Beta Student")
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Student B fetches their files
    resp_b = client.get("/api/v1/compiler/files?language=python", headers=headers_b)
    assert resp_b.status_code == 200
    files_b = resp_b.json()
    filenames_b = [f["filename"] for f in files_b]

    # Student B should NOT see Student A's file
    assert "alpha_secret.py" not in filenames_b


def test_java_workspace_lifecycle_and_empty_starter():
    # Brand new student with no Java files gets an empty workspace with Main.java
    fresh_email = f"java_fresh_{uuid.uuid4().hex[:8]}@example.com"
    token = get_auth_token(fresh_email, "Java Fresh Student")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. New student loads Java workspace -> gets empty Main.java
    resp = client.get("/api/v1/compiler/files?language=java", headers=headers)
    assert resp.status_code == 200
    files = resp.json()
    assert len(files) == 1
    assert files[0]["filename"] == "Main.java"
    assert files[0]["code"] == ""
    assert files[0]["is_active"] is True
    main_file_id = files[0]["id"]

    # 2. Student saves Java code in Main.java
    java_solution = """public class Main {
    public static void main(String[] args) {
        System.out.println("JAVA_PERSISTED_OK");
    }
}"""
    save_resp = client.put(
        f"/api/v1/compiler/files/{main_file_id}",
        json={"code": java_solution, "stdin": "sample_input"},
        headers=headers
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["code"] == java_solution

    # 3. Create a second Java file
    create_resp = client.post(
        "/api/v1/compiler/files",
        json={"language": "java", "filename": "Helper.java", "code": "class Helper {}"},
        headers=headers
    )
    assert create_resp.status_code == 201
    helper_id = create_resp.json()["id"]
    assert create_resp.json()["filename"] == "Helper.java"
    assert create_resp.json()["is_active"] is True

    # Verify Main.java is now inactive
    main_check = client.get(f"/api/v1/compiler/files/{main_file_id}", headers=headers).json()
    assert main_check["is_active"] is False

    # 4. Select Main.java again (make it active)
    select_resp = client.put(
        f"/api/v1/compiler/files/{main_file_id}",
        json={"is_active": True},
        headers=headers
    )
    assert select_resp.status_code == 200
    assert select_resp.json()["is_active"] is True

    # 5. Rename Helper.java -> Utility.java
    rename_resp = client.put(
        f"/api/v1/compiler/files/{helper_id}",
        json={"filename": "Utility.java"},
        headers=headers
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["filename"] == "Utility.java"

    # 6. Delete Utility.java
    del_resp = client.delete(f"/api/v1/compiler/files/{helper_id}", headers=headers)
    assert del_resp.status_code == 204

    # 7. Re-fetch files list: existing Java file Main.java remains saved with solution intact
    final_resp = client.get("/api/v1/compiler/files?language=java", headers=headers)
    assert final_resp.status_code == 200
    final_files = final_resp.json()
    assert len(final_files) == 1
    assert final_files[0]["id"] == main_file_id
    assert final_files[0]["code"] == java_solution


def test_workspaces_are_separate_across_all_languages():
    token = get_auth_token("polyglot_student@example.com", "Polyglot Student")
    headers = {"Authorization": f"Bearer {token}"}

    for lang in ["c", "cpp", "java", "python"]:
        resp = client.get(f"/api/v1/compiler/files?language={lang}", headers=headers)
        assert resp.status_code == 200
        files = resp.json()
        assert len(files) == 1
        assert files[0]["language"] == lang
        assert files[0]["code"] == ""  # empty starter workspace
