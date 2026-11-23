import sys
sys.path.insert(0, 'scratch')
from cdp_helper import eval_js

hub = eval_js('localStorage.getItem("__CURRENT_HUB__")')
print('Current hub:', hub)
auth = eval_js('localStorage.getItem("__AUTH_TOKEN__")')
print('Auth token exists:', bool(auth))
api_tokens = eval_js('localStorage.getItem("chrono_api_tokens")')
print('Api tokens:', api_tokens)
user = eval_js('localStorage.getItem("userName")')
print('User:', user)
