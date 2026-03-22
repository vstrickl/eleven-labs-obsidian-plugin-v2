import { App, PluginSettingTab, Setting } from "obsidian";
import ElevenLabsPlugin from "../main";

export const DEFAULT_MODEL_ID = "eleven_monolingual_v1";

export interface VoiceSettings {
    enabled: boolean;
    stability: number;
    similarity_boost: number;
}

export interface ElevenLabsSecrets {
    apiKey: string;
}

export interface ElevenLabsPluginSettings {
    selectedVoiceId: string | null;
    selectedModelId: string | null;
    voiceSettings: { [key: string]: VoiceSettings };
}

export const DEFAULT_SETTINGS: ElevenLabsPluginSettings = {
    selectedVoiceId: null,
    selectedModelId: null,
    voiceSettings: {},
};

export const DEFAULT_SECRETS: ElevenLabsSecrets = {
    apiKey: "",
};

export class ElevenLabsSettingTab extends PluginSettingTab {
    plugin: ElevenLabsPlugin;

    constructor(app: App, plugin: ElevenLabsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("⚠️ Security notice")
            .setDesc(
                "Your API key is stored in your vault's plugin data (data.json) " +
                "as plain text. Do not sync this vault to a public repository " +
                "or unencrypted cloud storage. Treat this key like a password."
            );

        // Make the API key input a password field
        new Setting(containerEl)
            .setName("API key")
            .setDesc("Your ElevenLabs API key from Profile Settings.")
            .addText((text) => {
                text.inputEl.type = "password";   // ← masks the key in UI
                text
                    .setPlaceholder("sk-...")
                    .setValue(this.plugin.secrets.apiKey)
                    .onChange(async (value) => {
                        this.plugin.secrets.apiKey = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}
