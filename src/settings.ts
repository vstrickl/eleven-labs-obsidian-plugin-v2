import { App, PluginSettingTab, Setting } from "obsidian";
import ElevenLabsPlugin from "../main";

export const DEFAULT_MODEL_ID = "eleven_monolingual_v1";

export interface VoiceSettings {
    enabled: boolean;
    stability: number;
    similarity_boost: number;
}

export interface ElevenLabsPluginSettings {
    selectedVoiceId: string | null;
    selectedModelId: string | null;
    voiceSettings: { [key: string]: VoiceSettings };
}

export interface ElevenLabsSessionState {
    apiKey: string | null;
}

export const DEFAULT_SETTINGS: ElevenLabsPluginSettings = {
    selectedVoiceId: null,
    selectedModelId: null,
    voiceSettings: {},
};

export const DEFAULT_SESSION: ElevenLabsSessionState = {
    apiKey: null,
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
            .setName("API Key")
            .setDesc("Your Eleven Labs API Key")
            .addText(
                (text) =>
                    (text
                        .setPlaceholder("Enter your API Key")
                        .setValue(this.plugin.settings.apiKey)
                        .onChange(async (value) => {
                            this.plugin.settings.apiKey = value;
                            await this.plugin.saveSettings();
                        }).inputEl.type = "password") // Set input type to password
            );
    }
}
