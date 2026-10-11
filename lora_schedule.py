"""Dynamic, model-only LoRA scheduler built on ComfyUI's native hook API."""

import json
import os

import comfy.hooks
import folder_paths
import comfy.utils
from aiohttp import web
from server import PromptServer


@PromptServer.instance.routes.get("/lora_schedule/loras")
async def list_loras(_request):
    return web.json_response(folder_paths.get_filename_list("loras"))


class MultiLoraSchedule:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "optional": {"prev_hooks": ("HOOKS",)},
            "hidden": {"lora_schedule_state": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("HOOKS",)
    RETURN_NAMES = ("HOOKS",)
    FUNCTION = "build_hooks"
    CATEGORY = "advanced/hooks/scheduling"
    DESCRIPTION = (
        "Stack model-only LoRAs in one node. Each row has its own strength and can be "
        "scheduled to stay at that strength between start and end sampling percentages."
    )

    def __init__(self):
        self._loaded_lora = None

    def _load_lora(self, name):
        path = folder_paths.get_full_path("loras", name)
        if not path or not os.path.isfile(path):
            raise FileNotFoundError(f"LoRA file was not found: {name}")
        if self._loaded_lora and self._loaded_lora[0] == path:
            return self._loaded_lora[1]
        weights = comfy.utils.load_torch_file(path, safe_load=True)
        self._loaded_lora = (path, weights)
        return weights

    @staticmethod
    def _schedule_hooks(hooks, start, end):
        start = float(start)
        end = float(end)
        if not (0.0 <= start < end <= 100.0):
            raise ValueError(
                f"Schedule percentages must satisfy 0 <= start < end <= 100 (got {start}, {end})."
            )
        keyframes = comfy.hooks.HookKeyframeGroup()
        if start > 0.0:
            keyframes.add(comfy.hooks.HookKeyframe(strength=0.0, start_percent=0.0))
        keyframes.add(comfy.hooks.HookKeyframe(strength=1.0, start_percent=start / 100.0))
        if end < 100.0:
            keyframes.add(comfy.hooks.HookKeyframe(strength=0.0, start_percent=end / 100.0))
        hooks.set_keyframes_on_hooks(keyframes)

    def build_hooks(self, lora_schedule_state="{}", prev_hooks=None):
        try:
            state = json.loads(lora_schedule_state or "{}")
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid LoRA schedule state: {exc}") from exc

        rows = state.get("loras", []) if isinstance(state, dict) else []
        combined = prev_hooks.clone() if prev_hooks is not None else None
        for index, row in enumerate(rows):
            if not isinstance(row, dict) or not row.get("enabled", True):
                continue
            name = str(row.get("name", "")).strip()
            if not name:
                continue
            strength = float(row.get("strength", 1.0))
            if strength == 0.0:
                continue
            weights = self._load_lora(name)
            hooks = comfy.hooks.create_hook_lora(
                lora=weights, strength_model=strength, strength_clip=0.0
            )
            if row.get("schedule_enabled", False):
                try:
                    self._schedule_hooks(hooks, row.get("start", 0), row.get("end", 100))
                except (TypeError, ValueError) as exc:
                    raise ValueError(f"LoRA row {index + 1} ({name}): {exc}") from exc
            combined = hooks if combined is None else combined.clone_and_combine(hooks)

        if combined is None:
            combined = comfy.hooks.HookGroup()
        return (combined,)


NODE_CLASS_MAPPINGS = {"MultiLoraSchedule": MultiLoraSchedule}
NODE_DISPLAY_NAME_MAPPINGS = {"MultiLoraSchedule": "Multi LoRA Schedule"}
WEB_DIRECTORY = "."
