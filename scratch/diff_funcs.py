import re

with open('content.js', 'r', encoding='utf-8') as f:
    c1 = f.read()
with open('android/app/src/main/assets/chrono_content.js', 'r', encoding='utf-8') as f:
    c2 = f.read()

f1 = set(re.findall(r'function\s+([a-zA-Z0-9_]+)', c1))
f2 = set(re.findall(r'function\s+([a-zA-Z0-9_]+)', c2))

print("In chrono_content.js but NOT in content.js:")
for f in sorted(f2 - f1):
    print(" +", f)

print("\nIn content.js but NOT in chrono_content.js:")
for f in sorted(f1 - f2):
    print(" -", f)
