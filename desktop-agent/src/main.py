import os
import sys
import asyncio
import argparse
import logging
import signal
from .common.config import AgentConfig
from .common.identity import get_device_identity
from .common.pairing import pair_device
from .common.agent import DesktopAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("SmartClassroomAgent")


def print_banner(config: AgentConfig, identity: dict):
    os_name = identity["os_type"].upper()
    status_str = "PAIRED & AUTHORIZED" if config.is_paired() else "UNPAIRED (Awaiting code)"

    banner = f"""
========================================================================
     SMART CLASSROOM - DESKTOP MONITORING AGENT v{config.agent_version}
========================================================================
  Workstation:    {identity['hostname']} ({os_name})
  Hardware UUID:  {identity['hardware_uuid']}
  OS Release:     {identity['os_version']}
  Backend URL:    {config.backend_url}
  Status:         {status_str}
  Student:        {config.student_name or 'Not assigned'} ({config.student_id or 'N/A'})
------------------------------------------------------------------------
  PRIVACY DISCLOSURE & SECURITY GUARANTEES:
  * NO keystroke recording or password tracking.
  * NO screen capture, video, or audio streaming in Phase 1.4.
  * NO clipboard or private file contents inspection.
  * Only reports OS-level foreground process changes and heartbeats.
  * All telemetry is cryptographically verified and sent to your instructor.
------------------------------------------------------------------------
  To disconnect and stop monitoring, press Ctrl+C at any time.
========================================================================
"""
    print(banner)


def parse_args():
    parser = argparse.ArgumentParser(description="Smart Classroom Desktop Monitoring Agent")
    parser.add_argument("--pairing-code", type=str, help="Single-use pairing code from Student Portal")
    parser.add_argument("--backend-url", type=str, help="FastAPI backend URL (e.g. http://127.0.0.1:8000)")
    parser.add_argument("--reset-pairing", action="store_true", help="Clear saved credentials and initiate fresh pairing")
    parser.add_argument("--config", type=str, default="agent_config.json", help="Path to local configuration file")
    return parser.parse_args()


def main():
    args = parse_args()
    config = AgentConfig(config_path=args.config)

    if args.backend_url:
        config.backend_url = args.backend_url.rstrip("/")

    if args.reset_pairing:
        logger.info("Resetting local pairing configuration...")
        config.reset_pairing()

    identity = get_device_identity()
    print_banner(config, identity)

    # Pairing workflow
    if not config.is_paired():
        code = args.pairing_code
        if not code:
            print("\n>> To connect this computer, open the Student Portal at http://localhost:5173")
            print(">> Click 'Pair Desktop Agent' on your dashboard to obtain your 6-character code.\n")
            try:
                code = input("Enter 6-character pairing code: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nAgent startup canceled.")
                sys.exit(0)

        if not code:
            print("Error: A pairing code is required to connect to the classroom.")
            sys.exit(1)

        try:
            print("\nExchanging pairing code with backend...")
            pair_device(config, code)
            print(f" Pairing successful! Linked to student: {config.student_name}\n")
        except Exception as e:
            print(f"\n Pairing failed: {e}")
            sys.exit(1)

    agent = DesktopAgent(config)

    # Signal handlers
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    def handle_exit(signum, frame):
        print("\n[Ctrl+C received] Stopping desktop agent cleanly...")
        loop.create_task(agent.shutdown())
        loop.stop()

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    try:
        loop.run_until_complete(agent.start())
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        loop.run_until_complete(agent.shutdown())
        loop.close()


if __name__ == "__main__":
    main()

