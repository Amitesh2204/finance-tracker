import requests
try:
    r = requests.get('http://127.0.0.1:5984/')
    print(r.status_code)
    print(r.text)
except Exception as e:
    print(type(e).__name__, e)
