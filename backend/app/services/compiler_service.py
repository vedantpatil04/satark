from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.app.models import PracticeFile, User
from backend.app.services.code_executor import detect_runtimes

# Comprehensive Windows Setup Guide
WINDOWS_SETUP_GUIDES = {
    "python": {
        "title": "Python 3 Runtime",
        "description": "Standard Python 3 interpreter used for executing Python scripts.",
        "quick_command": "winget install Python.Python.3.13",
        "steps": [
            "Download Python 3 from https://www.python.org/downloads/windows/ or install via winget: 'winget install Python.Python.3.13'",
            "IMPORTANT: Check the box 'Add python.exe to PATH' during installation.",
            "Restart your terminal or SATARK backend server to register PATH changes."
        ],
        "verification_command": "python --version"
    },
    "c": {
        "title": "GCC C Compiler (MinGW-w64)",
        "description": "GNU Compiler Collection for compiling and linking C programs.",
        "quick_command": "winget install MSYS2.MSYS2",
        "steps": [
            "Option 1 (Recommended): Install MSYS2 via winget: 'winget install MSYS2.MSYS2'",
            "Open MSYS2 terminal and run: 'pacman -S mingw-w64-ucrt-x86_64-gcc'",
            "Add 'C:\\msys64\\ucrt64\\bin' to your Windows System PATH environment variables.",
            "Option 2: Install WinLibs standalone GCC from https://winlibs.com and extract to C:\\mingw64, adding C:\\mingw64\\bin to PATH."
        ],
        "verification_command": "gcc --version"
    },
    "cpp": {
        "title": "G++ C++ Compiler (MinGW-w64)",
        "description": "GNU C++ compiler supporting C++11, C++17, and C++20 standards.",
        "quick_command": "winget install MSYS2.MSYS2",
        "steps": [
            "G++ is bundled with the MinGW-w64 GCC package.",
            "If using MSYS2: 'pacman -S mingw-w64-ucrt-x86_64-gcc'",
            "Ensure 'C:\\msys64\\ucrt64\\bin' is in your Windows System PATH.",
            "Verify by typing 'g++ --version' in Command Prompt or PowerShell."
        ],
        "verification_command": "g++ --version"
    },
    "java": {
        "title": "OpenJDK 17+ / Eclipse Temurin (Javac & Java)",
        "description": "Java Development Kit providing javac compiler and Java virtual machine.",
        "quick_command": "winget install EclipseAdoptium.Temurin.21.JDK",
        "steps": [
            "Install OpenJDK via winget: 'winget install EclipseAdoptium.Temurin.21.JDK' or download from https://adoptium.net",
            "Ensure the installer enables 'Set JAVA_HOME variable' and 'Add to PATH'.",
            "Default path is usually: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21...\\bin'",
            "Restart terminal and verify both 'javac --version' and 'java --version' output correctly."
        ],
        "verification_command": "javac --version"
    }
}

SAMPLE_PROGRAMS: Dict[str, List[Dict[str, Any]]] = {
    "c": [
        {
            "id": "c-hello",
            "title": "Hello & Custom Input",
            "description": "Reads user input from STDIN using scanf and prints a greeting.",
            "filename": "main.c",
            "language": "c",
            "code": """#include <stdio.h>

int main() {
    char name[50];
    printf("=== SATARK C Practice Workspace ===\\n");
    printf("Please enter your name: ");
    
    if (scanf("%49s", name) == 1) {
        printf("Hello, %s! Welcome to local C practice.\\n", name);
    } else {
        printf("Hello, Programmer! (No name provided in STDIN)\\n");
    }
    
    return 0;
}
""",
            "stdin": "Student"
        },
        {
            "id": "c-fibonacci",
            "title": "Fibonacci Series",
            "description": "Calculates the first N terms of the Fibonacci sequence.",
            "filename": "fibonacci.c",
            "language": "c",
            "code": """#include <stdio.h>

int main() {
    int n = 10;
    long long t1 = 0, t2 = 1, nextTerm;

    printf("Fibonacci Series (First %d terms):\\n", n);
    for (int i = 1; i <= n; ++i) {
        printf("%lld ", t1);
        nextTerm = t1 + t2;
        t1 = t2;
        t2 = nextTerm;
    }
    printf("\\n");
    return 0;
}
""",
            "stdin": ""
        },
        {
            "id": "c-sort",
            "title": "Bubble Sort Algorithm",
            "description": "Sorts an array of integers in ascending order.",
            "filename": "bubble_sort.c",
            "language": "c",
            "code": """#include <stdio.h>

void bubbleSort(int arr[], int n) {
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

int main() {
    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);

    printf("Original array: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");

    bubbleSort(arr, n);

    printf("Sorted array:   ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");

    return 0;
}
""",
            "stdin": ""
        }
    ],
    "cpp": [
        {
            "id": "cpp-vector",
            "title": "STL Vector & Algorithm",
            "description": "Demonstrates modern C++ STL vector, sorting, and lambda printing.",
            "filename": "main.cpp",
            "language": "cpp",
            "code": """#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::cout << "=== SATARK C++ Practice Workspace ===" << std::endl;
    std::vector<int> numbers = {45, 12, 85, 32, 89, 39, 69, 44, 42, 1, 6, 8};

    std::cout << "Original elements: ";
    for (int n : numbers) std::cout << n << " ";
    std::cout << std::endl;

    std::sort(numbers.begin(), numbers.end());

    std::cout << "Sorted elements:   ";
    for (int n : numbers) std::cout << n << " ";
    std::cout << std::endl;

    return 0;
}
""",
            "stdin": ""
        },
        {
            "id": "cpp-binary-search",
            "title": "Binary Search",
            "description": "Implements binary search algorithm on a sorted list.",
            "filename": "binary_search.cpp",
            "language": "cpp",
            "code": """#include <iostream>
#include <vector>

int binarySearch(const std::vector<int>& arr, int target) {
    int left = 0, right = arr.size() - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

int main() {
    std::vector<int> data = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
    int target = 23;

    int idx = binarySearch(data, target);
    if (idx != -1) {
        std::cout << "Element " << target << " found at index " << idx << std::endl;
    } else {
        std::cout << "Element " << target << " not found." << std::endl;
    }
    return 0;
}
""",
            "stdin": ""
        }
    ],
    "java": [
        {
            "id": "java-hello",
            "title": "Scanner & Arithmetic",
            "description": "Reads input using java.util.Scanner and performs basic calculations.",
            "filename": "Main.java",
            "language": "java",
            "code": """import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("=== SATARK Java Practice Workspace ===");
        System.out.print("Enter your name: ");

        if (scanner.hasNextLine()) {
            String name = scanner.nextLine();
            System.out.println("Hello, " + name + "! Welcome to Java Practice.");
        } else {
            System.out.println("Hello, Java Developer!");
        }

        int a = 25, b = 17;
        System.out.println("Calculation: " + a + " + " + b + " = " + (a + b));
        scanner.close();
    }
}
""",
            "stdin": "Candidate"
        },
        {
            "id": "java-palindrome",
            "title": "String Palindrome Checker",
            "description": "Reverses a string and tests whether it is a palindrome.",
            "filename": "Palindrome.java",
            "language": "java",
            "code": """public class Palindrome {
    public static boolean isPalindrome(String s) {
        String clean = s.replaceAll("[^a-zA-Z0-9]", "").toLowerCase();
        int left = 0, right = clean.length() - 1;
        while (left < right) {
            if (clean.charAt(left++) != clean.charAt(right--)) {
                return false;
            }
        }
        return true;
    }

    public static void main(String[] args) {
        String test = "A man, a plan, a canal: Panama";
        System.out.println("Testing string: \\"" + test + "\\"");
        System.out.println("Is palindrome? " + isPalindrome(test));
    }
}
""",
            "stdin": ""
        }
    ],
    "python": [
        {
            "id": "py-hello",
            "title": "Interactive Input & Stats",
            "description": "Demonstrates reading STDIN and calculating average, min, and max.",
            "filename": "main.py",
            "language": "python",
            "code": """import sys

def main():
    print("=== SATARK Python Practice Workspace ===")
    raw = sys.stdin.read().strip()
    
    if raw:
        numbers = [float(x) for x in raw.split() if x.replace('.', '', 1).isdigit()]
        if numbers:
            print(f"Numbers received: {numbers}")
            print(f"Count: {len(numbers)}, Sum: {sum(numbers):.2f}, Mean: {sum(numbers)/len(numbers):.2f}")
            print(f"Min: {min(numbers):.2f}, Max: {max(numbers):.2f}")
        else:
            print(f"Received text: {raw}")
    else:
        print("No STDIN provided. Running default demonstration:")
        squares = [x**2 for x in range(1, 11)]
        print(f"Squares from 1 to 10: {squares}")

if __name__ == "__main__":
    main()
""",
            "stdin": "12 45 78 23 56 89"
        },
        {
            "id": "py-primes",
            "title": "Prime Number Sieve",
            "description": "Finds all prime numbers up to N using the Sieve of Eratosthenes.",
            "filename": "primes.py",
            "language": "python",
            "code": """def sieve(n):
    is_prime = [True] * (n + 1)
    is_prime[0] = is_prime[1] = False
    for p in range(2, int(n**0.5) + 1):
        if is_prime[p]:
            for multiple in range(p * p, n + 1, p):
                is_prime[multiple] = False
    return [i for i, prime in enumerate(is_prime) if prime]

if __name__ == "__main__":
    limit = 50
    primes = sieve(limit)
    print(f"Primes up to {limit}:")
    print(primes)
""",
            "stdin": ""
        }
    ]
}


def get_health_check() -> Dict[str, Any]:
    """
    Returns complete compiler health check report and Windows installation guides.
    """
    runtimes = detect_runtimes()
    all_available = all(rt["is_available"] for rt in runtimes.values())
    any_available = any(rt["is_available"] for rt in runtimes.values())

    status = "healthy" if all_available else ("partial" if any_available else "unavailable")

    runtime_details = {}
    for lang, info in runtimes.items():
        details = dict(info)
        details["setup_guide"] = WINDOWS_SETUP_GUIDES.get(lang)
        runtime_details[lang] = details

    return {
        "status": status,
        "all_available": all_available,
        "summary": "All 4 local runtimes operational" if all_available else "Some local runtimes require installation on the host",
        "runtimes": runtime_details,
        "isolation_info": {
            "execution_model": "Isolated out-of-process subprocesses",
            "memory_limit_mb": 256,
            "timeout_seconds": 5.0,
            "filesystem_isolation": "Ephemeral per-run scratch directory",
            "network_isolation": "Sockets blocked / loopback null-routed",
            "honesty_notice": "Native Windows Job Object & process limit controls enforced. Container hypervisor sandboxing is not active on bare metal."
        }
    }


DEFAULT_STARTER_FILENAMES = {
    "java": "Main.java",
    "python": "main.py",
    "c": "main.c",
    "cpp": "main.cpp",
}


def get_or_create_default_files(db: Session, user_id: str, language: str) -> List[PracticeFile]:
    """
    Retrieves student's practice files for a given language.
    If none exist yet, automatically creates an empty starter file for that language workspace.
    Existing files are preserved and returned.
    """
    files = (
        db.query(PracticeFile)
        .filter(PracticeFile.user_id == user_id, PracticeFile.language == language)
        .order_by(PracticeFile.created_at.asc())
        .all()
    )

    if not files:
        starter_name = DEFAULT_STARTER_FILENAMES.get(language, f"main.{language}")
        starter_file = PracticeFile(
            user_id=user_id,
            language=language,
            filename=starter_name,
            code="",
            stdin="",
            is_active=True
        )
        db.add(starter_file)
        db.commit()
        db.refresh(starter_file)
        return [starter_file]

    return files

