Goal:
Create an upgraded image plugin for SillyTavern. The goal is to create a plugin that sends a more streamlined image generation prompt to the LLM, allowing more detailed prompt instructions to be made

Requirements: 
- Must be able to connect to ComfyUI for servicing the image requests 
- Must be able to create common prompt prefixes
- Must not send the entire preset for images. Instead images must be prepended with a seperate preset that can be defined for image generation
- Must present a button in the chat interface to generate images
- Must have the option to generate an image of the current scene, a portrait of a character, as well as a free form image edit. The plugin should include prompt fields in the configuration for these, similar to the existing image plugin. 
- Must use the main connected LLM to generate the image prompt
- Must send the character background along with the image prompt and instructions

References. 
- Silly Tavern base repository is at C:\Users\btuli\Desktop\SillyTavern. Backend code is at src/endpoints/stable-diffusion.js. Frontend code is at public/scripts/extensions/stable-diffusion/index.js
- A short example plugin is at C:\Users\btuli\Documents\repositories\st-extension-example