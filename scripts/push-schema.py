#!/usr/bin/env python3
import pty, os, sys, time, select, signal, termios, fcntl

DB_URL = "postgresql://postgres:chiakhoathanhcong@42.96.40.138:5432/xyz"

env = os.environ.copy()
env["APP_DATABASE_URL"] = DB_URL
env["DATABASE_URL"] = DB_URL
env["FORCE_COLOR"] = "0"
env["NO_COLOR"] = "1"

cmd = ["npx", "drizzle-kit", "push"]

print(f"[push-schema] Running: {' '.join(cmd)}")
print(f"[push-schema] Target DB: ...xyz")

master_fd, slave_fd = pty.openpty()

proc = __import__('subprocess').Popen(
    cmd,
    stdin=slave_fd,
    stdout=slave_fd,
    stderr=slave_fd,
    env=env,
    close_fds=True,
    cwd="/home/runner/workspace"
)

os.close(slave_fd)

buf = b""
last_enter = 0
answer_count = 0

try:
    while proc.poll() is None:
        try:
            r, _, _ = select.select([master_fd], [], [], 0.3)
        except (select.error, ValueError):
            break

        if r:
            try:
                chunk = os.read(master_fd, 4096)
            except OSError:
                break
            buf += chunk
            text = chunk.decode("utf-8", errors="replace")
            sys.stdout.write(text)
            sys.stdout.flush()

            now = time.time()
            # Detect selection prompts and press Enter to pick first option (create/new)
            triggers = [
                b"create table",
                b"create column",
                b"\xe2\x9d\xaf",  # ❯ character
                b"apply changes",
                b">>> ",
                b"? ",
            ]
            should_enter = any(t in buf[-500:] for t in triggers)
            if should_enter and (now - last_enter) > 0.8:
                time.sleep(0.3)
                os.write(master_fd, b"\r")
                last_enter = now
                answer_count += 1
                print(f"\n[push-schema] → Pressed Enter (choice #{answer_count})")
                buf = b""

except KeyboardInterrupt:
    proc.terminate()

finally:
    proc.wait()
    try:
        os.close(master_fd)
    except OSError:
        pass

print(f"\n[push-schema] Done. Exit code: {proc.returncode}")
