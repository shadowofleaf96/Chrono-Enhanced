import os
import subprocess
import sys

env = os.environ.copy()
java_home = r"C:\Program Files\Android\Android Studio\jbr"
env["JAVA_HOME"] = java_home
env["PATH"] = os.path.join(java_home, "bin") + os.pathsep + env.get("PATH", "")

print("Running gradlew assembleDebug...")
res = subprocess.run([r"cmd.exe", "/c", "gradlew.bat", "assembleDebug"], cwd="android", env=env)
if res.returncode == 0:
    print("Build successful! Installing APK...")
    subprocess.run(["adb", "install", "-r", r"android\app\build\outputs\apk\debug\app-debug.apk"], check=True)
    print("Installed successfully!")
else:
    print("Build failed with code:", res.returncode)
    sys.exit(res.returncode)
