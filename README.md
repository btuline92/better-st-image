# Better Image Generation for SillyTavern

A SillyTavern extension that provides improved image generation with a dedicated, streamlined prompt pipeline. Instead of sending image requests through the full chat preset, this plugin uses a separate image-specific system prompt — giving you precise control over how the LLM generates Stable Diffusion prompts.

## Why?

The built-in SillyTavern image generation sends prompts through `generateQuietPrompt()`, which includes the entire roleplay system prompt, character card, chat history, and preset instructions. This bloats the LLM call with irrelevant context and makes it difficult to craft focused image generation instructions.

**Better Image Generation** uses `generateRaw()` with a dedicated image system prompt. The character's background (name, description, personality, scenario) and recent chat are still included, but through a clean, user-defined prompt — not the full roleplay pipeline.

## Features

- **Dedicated image generation preset** — define a system prompt specifically for producing Stable Diffusion keywords, independent of your chat preset
- **ComfyUI integration** — connects via SillyTavern's built-in backend proxy (no CORS issues, no server modifications)
- **Three generation modes:**
  - **Portrait** — generates a character portrait from the character card
  - **Scene** — generates an image of the current scene from recent chat context
  - **Free-form** — type any description and the LLM expands it into SD keywords
- **Per-character prompt prefixes** — define positive and negative prompt prefixes per character
- **Customizable mode templates** — edit the LLM instruction for each generation mode
- **Full ComfyUI parameter control** — model, sampler, scheduler, steps, CFG, dimensions, seed
- **Slash commands** — `/bimg portrait`, `/bimg scene`, `/bimg a cat sitting on a throne`

## Installation

1. Navigate to your SillyTavern installation's third-party extensions folder:
   ```
   SillyTavern/public/scripts/extensions/third-party/
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/btuli/better-st-image.git
   ```

3. Restart SillyTavern (or reload the page).

4. Go to **Extensions** in SillyTavern and enable **Better Image Generation**.

## Setup

1. Open the **Better Image Generation** settings panel in the extensions sidebar.
2. Enter your **ComfyUI URL** (default: `http://127.0.0.1:8188`) and click **Connect**.
3. Select a **Workflow** from the dropdown. Your workflow should use these placeholders:
   - `%prompt%` — positive prompt
   - `%negative_prompt%` — negative prompt
   - `%seed%`, `%steps%`, `%scale%`, `%width%`, `%height%` — generation parameters
   - `%model%`, `%sampler%`, `%scheduler%` — model configuration
4. Configure generation parameters (model, sampler, dimensions, etc.).
5. Optionally customize the **Image Generation Preset** system prompt and mode templates.

## Usage

### Wand Menu Button

Click the wand/extensions menu in the chat interface and select **Better Image**. A dropdown appears with three options:

- **Character Portrait** — generates a portrait using the character's description
- **Current Scene** — generates an image of the current scene from recent messages
- **Free-form...** — opens a text input popup for a custom description

### Slash Commands

```
/bimg portrait              — Generate a character portrait
/bimg scene                 — Generate the current scene
/bimg a dragon in a castle  — Generate from free-form description
/bimg quiet=true portrait   — Generate without posting to chat
```

## Configuration

### Image Generation Preset

The system prompt sent to the LLM when generating image prompts. This is the key differentiator — edit this to control exactly how the LLM produces Stable Diffusion keywords. The default instructs the LLM to output only comma-separated visual keywords.

### Mode Templates

Each generation mode has its own LLM instruction template:

- **Portrait Prompt** — uses `{{char}}` and `{{user}}` macros for character-aware prompts
- **Scene Prompt** — instructs the LLM to describe the current scene visually
- **Free-form Instruction** — uses `{{input}}` to incorporate the user's text

### Prompt Prefixes

- **Global Prompt Prefix** — prepended to all generated prompts (e.g., `best quality, masterpiece,`)
- **Global Negative Prompt** — negative prompt applied to all generations
- **Character Prompt/Negative** — per-character overrides, automatically loaded when switching characters

## Requirements

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) (recent version with extension support)
- A running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) instance
- A connected LLM in SillyTavern (used for prompt generation)

## License

MIT
