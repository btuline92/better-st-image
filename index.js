import { extension_settings, getContext } from "../../../extensions.js";
import {
    event_types,
    eventSource,
    generateRaw,
    getRequestHeaders,
    saveSettingsDebounced,
    substituteParams,
    substituteParamsExtended,
    systemUserName,
    this_chid,
} from "../../../../script.js";
import {
    getBase64Async,
    getCharaFilename,
    saveBase64AsFile,
} from "../../../utils.js";
import { getMessageTimeStamp, humanizedDateTime } from "../../../RossAscends-mods.js";
import { debounce_timeout, MEDIA_DISPLAY, MEDIA_SOURCE, MEDIA_TYPE } from "../../../constants.js";
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";
import { SlashCommand } from "../../../slash-commands/SlashCommand.js";
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument,
} from "../../../slash-commands/SlashCommandArgument.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";
import { Popper } from "../../../../lib.js";
import { animation_duration, main_api } from "../../../../script.js";
import { oai_settings, chat_completion_sources } from "../../../openai.js";
import { textgenerationwebui_settings } from "../../../textgen-settings.js";

// ─── Constants ──────────────────────────────────────────────────────────────────

const extensionName = "better-st-image";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const generationModes = {
    PORTRAIT: "portrait",
    SCENE: "scene",
    FREE: "free",
};

const defaultSystemPrompt = `You are a Stable Diffusion prompt generator. Your response must contain ONLY comma-separated Danbooru-style tags. Do not respond with anything other than the tag list. NO sentences, NO commentary, NO explanations, NO preamble. Your entire reply is the tag list and nothing else.

CRITICAL: Every single tag MUST be separated by a comma. Do NOT use spaces alone, newlines, or any other separator between tags. The output is a single line of comma-separated tags. Example format: tag1, tag2, tag3, tag4,

Structure rules:
1. Begin with tags describing the scene/background: location, time of day, lighting, atmosphere.
2. Immediately after the scene tags, include a TOTAL gender count for all characters in the scene using Danbooru format: e.g. "2girls, 1boy,". This is a count of all characters, not per-character. Do NOT put gender count tags inside individual character BREAK sections.
3. Use the word BREAK to separate each character in the scene for multi-character composition. BREAK itself is also comma-separated: ..., tag, BREAK, tag, ...
4. If a character has a comma-separated tag list provided for their appearance, reproduce it exactly as-is without modification for visual consistency. Do NOT add 1girl/1boy inside individual character sections.
5. After the character appearance tags, add tags for that character's pose, clothing state, and current action.
6. Focus on: pose, clothing, literal action, physical interaction, and immediate background elements.
7. NSFW logic: if the scene is sexual or erotic, begin the entire output with the tag "explicit,".
8. End the output with a trailing comma.
9. Max 40 tags total.

You MUST output the tags directly as your response. Do not think about it and output nothing. Do not summarize. Just write the comma-separated tags.

Example output for a two-character scene:
tavern interior, night, candlelight, wooden table, 1girl, 1boy, BREAK, blonde hair, blue eyes, elf ears, white dress, sitting, holding cup, smiling, BREAK, black hair, armor, standing, leaning on table, looking at another,`;

const defaultPortraitPrompt = `Generate a portrait prompt for {{char}}.
Output comma-separated Danbooru-style tags only.
Start with "1girl," or "1boy," as the gender count tag, then BREAK, then the character's appearance tags (use provided tag list as-is if available), then pose and expression.
End with a trailing comma.`;

const defaultScenePrompt = `Convert the current scene from the recent conversation into a Stable Diffusion prompt.
Begin with background/location tags, then use BREAK to separate each character present.
For each character, output their appearance tags (use provided tag lists as-is), followed by their current pose, clothing, and action.
Extract the literal visual action from the last message. Focus on poses, clothing, and physical interaction.
End with a trailing comma.`;

const defaultFreeformInstruction = `Convert the following description into comma-separated Danbooru-style tags for Stable Diffusion.
Begin with scene/background tags, use BREAK between characters if multiple are present.
Use any provided character tag lists as-is. End with a trailing comma.

Description: {{input}}`;

const defaultPromptPrefix = "best quality, absurdres, aesthetic,";
const defaultNegativePrompt = "lowres, bad anatomy, bad hands, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry";

const defaultSettings = {
    comfy_url: "http://127.0.0.1:8188",
    comfy_workflow: "",
    image_system_prompt: defaultSystemPrompt,
    prompt_prefix: defaultPromptPrefix,
    negative_prompt: defaultNegativePrompt,
    character_prompts: {},
    character_negatives: {},
    portrait_prompt: defaultPortraitPrompt,
    scene_prompt: defaultScenePrompt,
    freeform_instruction: defaultFreeformInstruction,
    model: "",
    sampler: "",
    scheduler: "",
    width: 1024,
    height: 1024,
    steps: 30,
    cfg: 5,
    seed: -1,
    temp_override_enabled: false,
    temp_override_value: 0.30,
    model_override_enabled: false,
    model_override_name: "",
};

// ─── Settings Management ────────────────────────────────────────────────────────

function getSettings() {
    return extension_settings[extensionName];
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    const settings = extension_settings[extensionName];

    // Fill missing keys with defaults
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = typeof value === "object" && !Array.isArray(value)
                ? { ...value }
                : value;
        }
    }

    // Populate UI
    $("#bimg_comfy_url").val(settings.comfy_url);
    $("#bimg_system_prompt").val(settings.image_system_prompt);
    $("#bimg_prompt_prefix").val(settings.prompt_prefix);
    $("#bimg_negative_prompt").val(settings.negative_prompt);
    $("#bimg_portrait_prompt").val(settings.portrait_prompt);
    $("#bimg_scene_prompt").val(settings.scene_prompt);
    $("#bimg_freeform_instruction").val(settings.freeform_instruction);
    $("#bimg_width").val(settings.width);
    $("#bimg_height").val(settings.height);
    $("#bimg_steps").val(settings.steps);
    $("#bimg_cfg").val(settings.cfg);
    $("#bimg_seed").val(settings.seed);

    // Temperature override
    $("#bimg_temp_override_enabled").prop("checked", settings.temp_override_enabled);
    $("#bimg_temp_override_slider").val(settings.temp_override_value);
    $("#bimg_temp_override_display").text(settings.temp_override_value.toFixed(2));
    $("#bimg_temp_override_controls").toggle(settings.temp_override_enabled);

    // Model override
    $("#bimg_model_override_enabled").prop("checked", settings.model_override_enabled);
    $("#bimg_model_override_name").val(settings.model_override_name);
    $("#bimg_model_override_controls").toggle(settings.model_override_enabled);

    loadCharacterPrompts();
}

function loadCharacterPrompts() {
    const settings = getSettings();
    if (typeof this_chid === "undefined") return;

    const key = getCharaFilename(this_chid);
    if (!key) return;

    const charPrompt = settings.character_prompts[key] || "";
    const charNegative = settings.character_negatives[key] || "";
    $("#bimg_char_prompt").val(charPrompt);
    $("#bimg_char_negative").val(charNegative);
}

function saveCharacterPrompts() {
    const settings = getSettings();
    if (typeof this_chid === "undefined") return;

    const key = getCharaFilename(this_chid);
    if (!key) return;

    settings.character_prompts[key] = String($("#bimg_char_prompt").val());
    settings.character_negatives[key] = String($("#bimg_char_negative").val());
    saveSettingsDebounced();
}

// ─── Prefix Utilities ───────────────────────────────────────────────────────────

function combinePrefixes(str1, str2) {
    const process = (s) => s.trim().replace(/^,|,$/g, "").trim();
    if (!str2) return str1;
    str1 = process(str1);
    str2 = process(str2);
    if (!str1) return str2;
    if (!str2) return str1;
    return process(`${str1}, ${str2},`);
}

function getCharacterPrefix() {
    const settings = getSettings();
    if (typeof this_chid === "undefined") return "";
    const key = getCharaFilename(this_chid);
    return key ? (settings.character_prompts[key] || "") : "";
}

function getCharacterNegative() {
    const settings = getSettings();
    if (typeof this_chid === "undefined") return "";
    const key = getCharaFilename(this_chid);
    return key ? (settings.character_negatives[key] || "") : "";
}

// ─── ComfyUI Communication ──────────────────────────────────────────────────────

async function pingComfyUI() {
    const settings = getSettings();
    try {
        const result = await fetch("/api/sd/comfy/ping", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({ url: settings.comfy_url }),
        });
        return result.ok;
    } catch {
        return false;
    }
}

async function fetchComfyData(endpoint) {
    const settings = getSettings();
    const result = await fetch(`/api/sd/comfy/${endpoint}`, {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ url: settings.comfy_url }),
    });
    if (!result.ok) throw new Error(`Failed to fetch ${endpoint} from ComfyUI`);
    return result.json();
}

async function populateComfyDropdowns() {
    try {
        const [models, samplers, schedulers, workflows] = await Promise.all([
            fetchComfyData("models"),
            fetchComfyData("samplers"),
            fetchComfyData("schedulers"),
            fetchComfyData("workflows"),
        ]);

        const settings = getSettings();

        // Models
        const $model = $("#bimg_model").empty();
        for (const m of models) {
            const text = typeof m === "object" ? m.text : m;
            const value = typeof m === "object" ? m.value : m;
            $model.append(`<option value="${value}">${text}</option>`);
        }
        if (settings.model) $model.val(settings.model);

        // Samplers
        const $sampler = $("#bimg_sampler").empty();
        for (const s of samplers) {
            $sampler.append(`<option value="${s}">${s}</option>`);
        }
        if (settings.sampler) $sampler.val(settings.sampler);

        // Schedulers
        const $scheduler = $("#bimg_scheduler").empty();
        for (const s of schedulers) {
            $scheduler.append(`<option value="${s}">${s}</option>`);
        }
        if (settings.scheduler) $scheduler.val(settings.scheduler);

        // Workflows
        const $workflow = $("#bimg_comfy_workflow").empty();
        for (const w of workflows) {
            $workflow.append(`<option value="${w}">${w}</option>`);
        }
        if (settings.comfy_workflow) $workflow.val(settings.comfy_workflow);

    } catch (err) {
        console.error("[BetterImage] Failed to populate ComfyUI dropdowns:", err);
        toastr.error("Failed to load ComfyUI data. Check connection.", "Better Image");
    }
}

async function generateComfyImage(prompt, negativePrompt, signal) {
    const settings = getSettings();

    // Load workflow
    const workflowResponse = await fetch("/api/sd/comfy/workflow", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ file_name: settings.comfy_workflow }),
    });
    if (!workflowResponse.ok) {
        const text = await workflowResponse.text();
        throw new Error(`Failed to load workflow: ${text}`);
    }

    let workflow = await workflowResponse.json();

    // Replace placeholders in workflow JSON
    workflow = workflow.replaceAll('"%prompt%"', JSON.stringify(prompt));
    workflow = workflow.replaceAll('"%negative_prompt%"', JSON.stringify(negativePrompt));

    const seed = settings.seed >= 0 ? settings.seed : Math.round(Math.random() * Number.MAX_SAFE_INTEGER);
    workflow = workflow.replaceAll('"%seed%"', JSON.stringify(seed));

    const placeholders = ["model", "sampler", "scheduler", "steps", "width", "height"];
    for (const ph of placeholders) {
        workflow = workflow.replaceAll(`"%${ph}%"`, JSON.stringify(settings[ph]));
    }
    workflow = workflow.replaceAll('"%scale%"', JSON.stringify(settings.cfg));

    console.log("[BetterImage] ComfyUI prompt:", workflow);

    const result = await fetch("/api/sd/comfy/generate", {
        method: "POST",
        headers: getRequestHeaders(),
        signal: signal,
        body: JSON.stringify({
            url: settings.comfy_url,
            prompt: `{"prompt": ${workflow}}`,
        }),
    });

    if (!result.ok) {
        const text = await result.text();
        throw new Error(`ComfyUI generation failed: ${text}`);
    }

    return result.json();
}

// ─── LLM Prompt Generation ──────────────────────────────────────────────────────

function getCharacterBackground() {
    const context = getContext();
    const result = {
        charName: "Character",
        charDescription: "",
        charPersonality: "",
        scenario: "",
        userName: "",
        userPersona: "",
    };

    if (typeof this_chid !== "undefined" && context.characters[context.characterId]) {
        const char = context.characters[context.characterId];
        result.charName = context.name2 || char.name || "Character";
        result.charDescription = char.description || "";
        result.charPersonality = char.personality || "";
        result.scenario = char.scenario || "";
    }

    // Get user persona
    result.userName = context.name1 || "";
    const fields = context.getCharacterCardFields?.();
    if (fields?.persona) {
        result.userPersona = fields.persona;
    }

    return result;
}

function getRecentChat(count = 5) {
    const context = getContext();
    if (!context.chat || context.chat.length === 0) return "";

    return context.chat
        .slice(-count)
        .filter((m) => !m.is_system)
        .map((m) => `${m.name}: ${m.mes}`)
        .join("\n");
}

async function generateImagePrompt(mode, userInput = "") {
    const settings = getSettings();
    const charBg = getCharacterBackground();
    const recentChat = getRecentChat();

    // Select the mode-specific instruction
    let modeInstruction;
    switch (mode) {
        case generationModes.PORTRAIT:
            modeInstruction = substituteParams(settings.portrait_prompt);
            break;
        case generationModes.SCENE:
            modeInstruction = substituteParams(settings.scene_prompt);
            break;
        case generationModes.FREE:
            modeInstruction = settings.freeform_instruction.replace("{{input}}", userInput);
            modeInstruction = substituteParams(modeInstruction);
            break;
        default:
            throw new Error(`Unknown generation mode: ${mode}`);
    }

    // Build the user prompt with character context
    const parts = [`Task: ${modeInstruction}`];

    if (charBg.charName) parts.push(`Character Name: ${charBg.charName}`);
    if (charBg.charDescription) parts.push(`Character Description: ${charBg.charDescription}`);
    if (charBg.charPersonality) parts.push(`Character Personality: ${charBg.charPersonality}`);
    if (charBg.scenario) parts.push(`Current Scenario: ${charBg.scenario}`);
    if (charBg.userName) parts.push(`User Name: ${charBg.userName}`);
    if (charBg.userPersona) parts.push(`User Persona: ${charBg.userPersona}`);

    if (recentChat) {
        parts.push(`\nRecent conversation:\n${recentChat}`);
    }

    const fullPrompt = parts.join("\n");

    console.log("[BetterImage] LLM prompt:", fullPrompt);
    console.log("[BetterImage] System prompt:", settings.image_system_prompt);

    const toast = toastr.info("Generating image prompt...", "Better Image");

    // Temporarily override temperature if enabled
    let savedTemp = null;
    if (settings.temp_override_enabled) {
        const overrideTemp = settings.temp_override_value;
        if (main_api === "openai") {
            savedTemp = { api: "openai", value: oai_settings.temp_openai };
            oai_settings.temp_openai = overrideTemp;
        } else {
            savedTemp = { api: "textgen", value: textgenerationwebui_settings.temp };
            textgenerationwebui_settings.temp = overrideTemp;
        }
        console.log(`[BetterImage] Temperature override: ${overrideTemp}`);
    }

    // Temporarily override model if enabled (OpenRouter/NanoGPT only)
    let savedModel = null;
    if (settings.model_override_enabled && settings.model_override_name) {
        const source = oai_settings.chat_completion_source;
        if (source === chat_completion_sources.OPENROUTER) {
            savedModel = { key: "openrouter_model", value: oai_settings.openrouter_model };
            oai_settings.openrouter_model = settings.model_override_name;
            console.log(`[BetterImage] Model override (OpenRouter): ${settings.model_override_name}`);
        } else if (source === chat_completion_sources.NANOGPT) {
            savedModel = { key: "nanogpt_model", value: oai_settings.nanogpt_model };
            oai_settings.nanogpt_model = settings.model_override_name;
            console.log(`[BetterImage] Model override (NanoGPT): ${settings.model_override_name}`);
        } else {
            console.log(`[BetterImage] Model override skipped — only supported for OpenRouter and NanoGPT (current: ${source})`);
        }
    }

    try {
        const result = await generateRaw({
            prompt: fullPrompt + "\n\nRespond with ONLY the comma-separated tags. Your entire reply must be the tag list.",
            systemPrompt: settings.image_system_prompt,
            responseLength: 5000,
        });

        toastr.clear(toast);

        if (!result) {
            throw new Error("LLM returned empty response. The model may be placing output in its reasoning block. Try disabling extended thinking or reasoning for this model.");
        }

        // Clean up the response — strip non-tag content
        let cleaned = result
            .replace(/^["']|["']$/g, "")  // strip wrapping quotes
            .replace(/^(Here|Tags|Output|The tags)[^:]*:\s*/i, "")  // strip preamble like "Here are the tags:"
            .trim();
        console.log("[BetterImage] LLM result:", cleaned);
        return cleaned;
    } catch (err) {
        toastr.clear(toast);
        throw err;
    } finally {
        // Always restore original temperature
        if (savedTemp) {
            if (savedTemp.api === "openai") {
                oai_settings.temp_openai = savedTemp.value;
            } else {
                textgenerationwebui_settings.temp = savedTemp.value;
            }
        }
        // Always restore original model
        if (savedModel) {
            oai_settings[savedModel.key] = savedModel.value;
        }
    }
}

// ─── Image Generation Pipeline ──────────────────────────────────────────────────

async function generatePicture(mode, userInput = "", quiet = false) {
    const settings = getSettings();

    if (!settings.comfy_url || !settings.comfy_workflow) {
        toastr.warning("Please configure ComfyUI URL and workflow in Better Image settings.", "Better Image");
        return;
    }

    const button = document.getElementById("bimg_gen");
    const abortController = new AbortController();

    try {
        // Mark busy
        button?.classList.add("bimg_busy");

        // Step 1: Generate the text prompt via LLM
        let prompt;
        if (mode === generationModes.FREE && !settings.freeform_instruction.includes("{{input}}")) {
            // If no instruction template, use raw input as prompt
            prompt = userInput;
        } else {
            prompt = await generateImagePrompt(mode, userInput);
        }

        // Step 2: Combine with prefixes
        const globalPrefix = settings.prompt_prefix || "";
        const charPrefix = getCharacterPrefix();
        const fullPrompt = combinePrefixes(combinePrefixes(globalPrefix, charPrefix), prompt);

        const globalNegative = settings.negative_prompt || "";
        const charNegative = getCharacterNegative();
        const fullNegative = combinePrefixes(globalNegative, charNegative);

        console.log("[BetterImage] Final prompt:", fullPrompt);
        console.log("[BetterImage] Final negative:", fullNegative);

        // Step 3: Generate via ComfyUI
        const genToast = toastr.info("Generating image...", "Better Image", { timeOut: 0, extendedTimeOut: 0 });
        let result;
        try {
            result = await generateComfyImage(fullPrompt, fullNegative, abortController.signal);
        } finally {
            toastr.clear(genToast);
        }

        if (!result || !result.data) {
            throw new Error("ComfyUI returned no image data");
        }

        // Step 4: Save image
        const context = getContext();
        const characterName = context.groupId
            ? context.groups?.find((g) => g.id === context.groupId)?.id?.toString() || ""
            : context.characters[context.characterId]?.name || "";

        const filename = `${humanizedDateTime()}`;
        const imagePath = await saveBase64AsFile(result.data, characterName, filename, result.format || "png");

        // Step 5: Insert into chat
        if (!quiet) {
            await insertImageMessage(prompt, imagePath, result.format || "png");
        }

        toastr.success("Image generated!", "Better Image");
        return imagePath;

    } catch (err) {
        if (abortController.signal.aborted) {
            toastr.info("Image generation cancelled.", "Better Image");
            return;
        }
        console.error("[BetterImage] Generation failed:", err);
        toastr.error(`Image generation failed: ${err.message}`, "Better Image");
    } finally {
        button?.classList.remove("bimg_busy");
    }
}

async function insertImageMessage(prompt, imagePath, format) {
    const context = getContext();
    const name = context.groupId ? systemUserName : context.name2;

    const message = {
        name: name,
        is_user: false,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: `[${name} sends a picture: ${prompt}]`,
        extra: {
            media: [{
                url: imagePath,
                type: MEDIA_TYPE.IMAGE,
                title: prompt,
                source: MEDIA_SOURCE.GENERATED,
            }],
            media_display: MEDIA_DISPLAY.GALLERY,
            media_index: 0,
            inline_image: false,
        },
    };

    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_RECEIVED, messageId, "extension");
    context.addOneMessage(message);
    await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId, "extension");
    await context.saveChat();
    setTimeout(() => context.scrollOnMediaLoad?.(), debounce_timeout.short);
}

// ─── UI Event Handlers ──────────────────────────────────────────────────────────

function setupSettingsHandlers() {
    // ComfyUI URL
    $("#bimg_comfy_url").on("input", function () {
        getSettings().comfy_url = String($(this).val());
        saveSettingsDebounced();
    });

    // Connect button
    $("#bimg_comfy_validate").on("click", async function () {
        const ok = await pingComfyUI();
        if (ok) {
            toastr.success("Connected to ComfyUI!", "Better Image");
            await populateComfyDropdowns();
        } else {
            toastr.error("Could not connect to ComfyUI. Check URL.", "Better Image");
        }
    });

    // Workflow
    $("#bimg_comfy_workflow").on("change", function () {
        getSettings().comfy_workflow = String($(this).val());
        saveSettingsDebounced();
    });

    // System prompt
    $("#bimg_system_prompt").on("input", function () {
        getSettings().image_system_prompt = String($(this).val());
        saveSettingsDebounced();
    });

    // Prompt prefixes
    $("#bimg_prompt_prefix").on("input", function () {
        getSettings().prompt_prefix = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_negative_prompt").on("input", function () {
        getSettings().negative_prompt = String($(this).val());
        saveSettingsDebounced();
    });

    // Character prompts
    $("#bimg_char_prompt").on("input", saveCharacterPrompts);
    $("#bimg_char_negative").on("input", saveCharacterPrompts);

    // Mode prompts
    $("#bimg_portrait_prompt").on("input", function () {
        getSettings().portrait_prompt = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_scene_prompt").on("input", function () {
        getSettings().scene_prompt = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_freeform_instruction").on("input", function () {
        getSettings().freeform_instruction = String($(this).val());
        saveSettingsDebounced();
    });

    // Generation parameters
    $("#bimg_model").on("change", function () {
        getSettings().model = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_sampler").on("change", function () {
        getSettings().sampler = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_scheduler").on("change", function () {
        getSettings().scheduler = String($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_width").on("input", function () {
        getSettings().width = Number($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_height").on("input", function () {
        getSettings().height = Number($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_steps").on("input", function () {
        getSettings().steps = Number($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_cfg").on("input", function () {
        getSettings().cfg = Number($(this).val());
        saveSettingsDebounced();
    });

    $("#bimg_seed").on("input", function () {
        getSettings().seed = Number($(this).val());
        saveSettingsDebounced();
    });

    // Temperature override
    $("#bimg_temp_override_enabled").on("change", function () {
        const enabled = Boolean($(this).prop("checked"));
        getSettings().temp_override_enabled = enabled;
        $("#bimg_temp_override_controls").toggle(enabled);
        saveSettingsDebounced();
    });

    $("#bimg_temp_override_slider").on("input", function () {
        const value = Number($(this).val());
        getSettings().temp_override_value = value;
        $("#bimg_temp_override_display").text(value.toFixed(2));
        saveSettingsDebounced();
    });

    // Model override
    $("#bimg_model_override_enabled").on("change", function () {
        const enabled = Boolean($(this).prop("checked"));
        getSettings().model_override_enabled = enabled;
        $("#bimg_model_override_controls").toggle(enabled);
        saveSettingsDebounced();
    });

    $("#bimg_model_override_name").on("input", function () {
        getSettings().model_override_name = String($(this).val());
        saveSettingsDebounced();
    });
}

function setupButtonHandlers() {
    const button = $("#bimg_gen");
    const dropdown = $("#bimg_dropdown");
    dropdown.hide();

    // Use Popper.js for positioning (same pattern as built-in SD extension)
    const popper = Popper.createPopper(button.get(0), dropdown.get(0), {
        placement: "top",
    });

    // Toggle dropdown on click — uses document-level handler like built-in SD
    $(document).on("click touchend", function (e) {
        const target = $(e.target);
        if (target.is(dropdown) || target.closest(dropdown).length) return;
        if ((target.is(button) || target.closest(button).length) && !dropdown.is(":visible")) {
            e.preventDefault();
            dropdown.fadeIn(animation_duration);
            popper.update();
        } else {
            dropdown.fadeOut(animation_duration);
        }
    });

    // Dropdown item clicks
    $("#bimg_dropdown [id]").on("click", function () {
        dropdown.fadeOut(animation_duration);
        const mode = $(this).data("value");
        if (mode === "portrait") {
            generatePicture(generationModes.PORTRAIT);
        } else if (mode === "scene") {
            generatePicture(generationModes.SCENE);
        } else if (mode === "free") {
            callGenericPopup("Enter image description:", POPUP_TYPE.INPUT).then((input) => {
                if (input) {
                    generatePicture(generationModes.FREE, String(input));
                }
            });
        }
    });
}

// ─── Slash Commands ─────────────────────────────────────────────────────────────

function registerSlashCommands() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: "bimg",
        aliases: ["betterimage", "bimage"],
        callback: async function (args, text) {
            const trimmed = (text || "").trim().toLowerCase();
            const quiet = args.quiet === "true";

            if (trimmed === "portrait") {
                await generatePicture(generationModes.PORTRAIT, "", quiet);
            } else if (trimmed === "scene") {
                await generatePicture(generationModes.SCENE, "", quiet);
            } else if (trimmed) {
                await generatePicture(generationModes.FREE, text.trim(), quiet);
            } else {
                toastr.warning("Usage: /bimg portrait | scene | [free text]", "Better Image");
            }
            return "";
        },
        helpString: "<div>Generate an image using Better Image Generation.<br>/bimg portrait - Character portrait<br>/bimg scene - Current scene<br>/bimg [text] - Free-form image</div>",
        returns: "image path",
        unnamedArgumentList: [
            new SlashCommandArgument("mode or prompt", [ARGUMENT_TYPE.STRING], false),
        ],
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({
                name: "quiet",
                description: "Don't post the image to chat",
                typeList: [ARGUMENT_TYPE.BOOLEAN],
                defaultValue: "false",
            }),
        ],
    }));
}

// ─── Initialization ─────────────────────────────────────────────────────────────

jQuery(async () => {
    // Load and append settings HTML
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);

    // Load and append button HTML
    const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
    // Append generation button to the extensions wand menu
    $("#extensionsMenu").append(`<div id="bimg_wand_container" class="extension_container"></div>`);
    $("#bimg_wand_container").append($(buttonHtml).filter("#bimg_gen"));
    // Append dropdown to body for absolute positioning
    $(document.body).append($(buttonHtml).filter("#bimg_dropdown"));

    // Initialize settings
    loadSettings();
    setupSettingsHandlers();
    setupButtonHandlers();
    registerSlashCommands();

    // Reload character prompts when character changes
    eventSource.on(event_types.CHAT_CHANGED, () => {
        loadCharacterPrompts();
    });

    console.log("[BetterImage] Extension loaded");
});
