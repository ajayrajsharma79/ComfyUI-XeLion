"""Encode ordered prompt segments and apply ComfyUI timestep ranges."""

import json

import node_helpers


class MultiPromptSchedule:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"clip": ("CLIP",)},
            "hidden": {"prompt_schedule_state": ("STRING", {"default": "{}"})},
        }

    RETURN_TYPES = ("CONDITIONING",)
    RETURN_NAMES = ("CONDITIONING",)
    FUNCTION = "encode_prompts"
    CATEGORY = "advanced/conditioning/scheduling"
    DESCRIPTION = (
        "Encode prompts in top-to-bottom order and assign each a consecutive sampling range. "
        "Each prompt starts where the previous prompt ends; ranges stay within 0.000–1.000."
    )

    def encode_prompts(self, clip, prompt_schedule_state="{}"):
        try:
            state = json.loads(prompt_schedule_state or "{}")
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid prompt schedule state: {exc}") from exc

        prompts = state.get("prompts", []) if isinstance(state, dict) else []
        combined = []
        cursor = 0.0
        for index, row in enumerate(prompts):
            if not isinstance(row, dict):
                raise ValueError(f"Prompt row {index + 1} must be an object.")
            try:
                end = float(row.get("end", 1.0))
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Prompt row {index + 1} has an invalid end range.") from exc
            if not (cursor < end <= 1.0):
                raise ValueError(
                    f"Prompt row {index + 1} must end after {cursor:.3f} and at or before 1.000 "
                    f"(got {end:.3f})."
                )

            text = str(row.get("text", ""))
            if text.strip():
                tokens = clip.tokenize(text)
                conditioning = clip.encode_from_tokens_scheduled(tokens)
                conditioning = node_helpers.conditioning_set_values(
                    conditioning,
                    {"start_percent": cursor, "end_percent": end},
                )
                combined.extend(conditioning)
            cursor = end

        return (combined,)


NODE_CLASS_MAPPINGS = {"MultiPromptSchedule": MultiPromptSchedule}
NODE_DISPLAY_NAME_MAPPINGS = {"MultiPromptSchedule": "Multi Prompt Scheduler"}
