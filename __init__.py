from .lora_schedule import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS, WEB_DIRECTORY
from .multi_prompt_schedule import (
    NODE_CLASS_MAPPINGS as PROMPT_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as PROMPT_NODE_DISPLAY_NAME_MAPPINGS,
)

# ComfyUI lists this package's frontend files under its folder name. This node
# pack's installed folder contains spaces and an apostrophe, which the live server
# advertises but currently fails to serve. Register a URL-safe alias for the same
# web directory so the frontend extension can be loaded reliably.
import os
import nodes as comfy_nodes

comfy_nodes.EXTENSION_WEB_DIRS["xe-lion-comfyui-nodes"] = os.path.dirname(__file__)

NODE_CLASS_MAPPINGS = {**NODE_CLASS_MAPPINGS, **PROMPT_NODE_CLASS_MAPPINGS}
NODE_DISPLAY_NAME_MAPPINGS = {**NODE_DISPLAY_NAME_MAPPINGS, **PROMPT_NODE_DISPLAY_NAME_MAPPINGS}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
