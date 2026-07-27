import json, os, urllib.request

api_key = os.getenv('NVIDIA_API_KEY')
models = [
    'nvidia/llama-3.1-nemotron-nano-8b-v1',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'nvidia/llama-3.1-nemotron-8b-instruct',
    'nvidia/nemotron-4-340b-instruct',
    'nvidia/llama-3.1-8b-instruct',
    'meta/llama-3.1-8b-instruct',
    'meta/llama-3.3-70b-instruct',
    'mistralai/mistral-nemo-12b-instruct',
    'microsoft/phi-3-mini-4k-instruct'
]

for model in models:
    payload = json.dumps({
        'model': model,
        'messages': [{'role': 'user', 'content': 'Reply with one short sentence about the weather in Paris.'}],
        'temperature': 0.7,
        'max_tokens': 200,
        'stream': False
    }).encode()
    req = urllib.request.Request(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode()
            print(model, '=> OK')
            print(body[:400])
            print('---')
    except Exception as e:
        print(model, '=> ERROR', type(e).__name__, e)
        print('---')
