# haraj-curl-cffi

Browserless Haraj search via TLS fingerprint impersonation (`curl_cffi`).

```bash
pip install -r requirements.txt
python scrape.py "غسالة" --limit 20   # JSON on stdout
```

Idea: replay a real Chrome TLS/JA3 handshake and POST directly to Haraj's
GraphQL search endpoint — structured JSON in <0.5s with no browser overhead.
The server answers HTTP 200 with a literal `"..."` body for rejected query
shapes; the script treats that as an error.
