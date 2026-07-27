import pathlib, re, subprocess

text = pathlib.Path(r'c:/Users/Lenovo/Documents/Codex/2026-07-27/as-your-first-task-please-create/outputs/multi-model-chatbot/.env').read_text()
m = re.search(r'^NVIDIA_API_KEY=(.+)$', text, re.M)
key = m.group(1).strip() if m else ''
cmd = [
    'curl', '-sS', '-o', '-', '-w', '%{http_code}',
    '-X', 'POST', 'https://integrate.api.nvidia.com/v1/chat/completions',
    '-H', f'Authorization: Bearer {key}',
    '-H', 'Content-Type: application/json',
    '--data', '{"model":"nvidia/llama-3.1-nemotron-nano-8b-v1","messages":[{"role":"user","content":"hi"}],"max_tokens":8,"stream":false}'
]
res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
print('exit', res.returncode)
print('stdout', res.stdout)
print('stderr', res.stderr)
