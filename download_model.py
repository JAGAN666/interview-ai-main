from huggingface_hub import hf_hub_download
import os

model_name = "TheBloke/Mistral-7B-Instruct-v0.2-GGUF"
model_file = "mistral-7b-instruct-v0.2.Q4_K_M.gguf"
local_dir = "server/models"

print(f"Downloading {model_file} to {local_dir}...")
path = hf_hub_download(repo_id=model_name, filename=model_file, local_dir=local_dir, local_dir_use_symlinks=False)
print(f"Model downloaded to: {path}")
