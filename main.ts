import {
    Editor,
    MarkdownView,
    Plugin,
    Menu,
    MarkdownFileInfo,
    Notice,
    setIcon,
} from "obsidian";
import {
    ElevenLabsPluginSettings,
    DEFAULT_SETTINGS,
    ElevenLabsSettingTab,
    ElevenLabsSecrets,
    DEFAULT_SECRETS,
} from "./src/settings";
import ElevenLabsApi from "./src/eleven_labs_api";
import { EditorView } from "@codemirror/view";
import { setTTSHighlight, ttsHighlightField } from "./src/tts-highlight";

type AudioState = "idle" | "playing" | "paused";

export default class ElevenLabsPlugin extends Plugin {
    settings: ElevenLabsPluginSettings;
    secrets: ElevenLabsSecrets;
    voices: any[];
    models: any[];

    currentAudio: HTMLAudioElement | null = null;
    audioState: AudioState = "idle";
    private currentBlobUrl: string | null = null;
    private ttsEditorView: EditorView | null = null;
    private ribbonIconEl: HTMLElement | null = null;

    addContextMenuItems = (
        menu: Menu,
        _editor: Editor,
        _info: MarkdownView | MarkdownFileInfo
    ) => {
        if (this.audioState === "playing") {
            menu.addItem((item) =>
                item.setTitle("Pause").setIcon("pause").onClick(() => this.handleTTSTrigger())
            );
        } else if (this.audioState === "paused") {
            menu.addItem((item) =>
                item.setTitle("Resume").setIcon("play").onClick(() => this.handleTTSTrigger())
            );
        } else {
            const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
            const selectedText = markdownView?.editor.getSelection();
            if (selectedText) {
                menu.addItem((item) =>
                    item.setTitle("Read aloud").setIcon("audio-lines").onClick(() => this.handleTTSTrigger())
                );
            }
        }
    };

    registerTTSEditorExtension() {
        this.registerEditorExtension(ttsHighlightField);
    }

    async handleTTSTrigger() {
        if (this.audioState === "playing") {
            this.currentAudio!.pause();
            this.audioState = "paused";
            this.updateRibbonIcon();
            return;
        }

        if (this.audioState === "paused") {
            await this.currentAudio!.play();
            this.audioState = "playing";
            this.updateRibbonIcon();
            return;
        }

        // idle — require selected text and configured voice/model
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice("Eleven Labs: Open a note and select text to read aloud.", 3000);
            return;
        }

        const selectedText = markdownView.editor.getSelection();
        if (!selectedText) return;

        const voiceId = this.settings.selectedVoiceId;
        const modelId = this.settings.selectedModelId;
        if (!voiceId || !modelId) {
            new Notice("Eleven Labs: Select a voice and model in Settings.", 5000);
            return;
        }

        // Capture the CM6 selection range before the async network call so the
        // highlight is anchored to the user's original selection even if focus moves.
        const cmEditor = (markdownView.editor as any)?.cm as EditorView | undefined;
        const selRange = cmEditor?.state.selection.main;

        try {
            new Notice("Eleven Labs: Generating audio...", 3000);

            const response = await ElevenLabsApi.textToSpeech(
                this.secrets.apiKey,
                selectedText,
                voiceId,
                modelId,
            );

            if (response.status !== 200) {
                new Notice("Eleven Labs: Failed to generate audio. Check your API key.", 5000);
                return;
            }

            const blob = new Blob([response.arrayBuffer], { type: "audio/mpeg" });
            const blobUrl = URL.createObjectURL(blob);
            const audio = new Audio(blobUrl);

            this.currentAudio = audio;
            this.currentBlobUrl = blobUrl;

            audio.onended = () => {
                URL.revokeObjectURL(blobUrl);
                this.currentAudio = null;
                this.currentBlobUrl = null;
                this.audioState = "idle";
                this.clearTTSHighlight();
                this.updateRibbonIcon();
            };

            // Apply in-editor highlight over the original selection
            if (cmEditor && selRange && selRange.from !== selRange.to) {
                this.ttsEditorView = cmEditor;
                cmEditor.dispatch({
                    effects: setTTSHighlight.of({ from: selRange.from, to: selRange.to }),
                });
            }

            await audio.play();
            this.audioState = "playing";
            this.updateRibbonIcon();
        } catch (error) {
            console.error("ElevenLabs: failed to generate or play audio.", error);
            new Notice("Eleven Labs: Failed to generate audio. Check your API key.", 5000);
        }
    }

    private clearTTSHighlight() {
        if (this.ttsEditorView) {
            this.ttsEditorView.dispatch({
                effects: setTTSHighlight.of(null),
            });
            this.ttsEditorView = null;
        }
    }

    private updateRibbonIcon() {
        if (!this.ribbonIconEl) return;
        if (this.audioState === "playing") {
            setIcon(this.ribbonIconEl, "pause");
            this.ribbonIconEl.setAttribute("aria-label", "Pause TTS");
        } else if (this.audioState === "paused") {
            setIcon(this.ribbonIconEl, "play");
            this.ribbonIconEl.setAttribute("aria-label", "Resume TTS");
        } else {
            setIcon(this.ribbonIconEl, "audio-lines");
            this.ribbonIconEl.setAttribute("aria-label", "Read selected text aloud");
        }
    }

    async onload() {
        await this.loadSettings();

        // Load voices
        await this.loadVoices();

        // Load models
        await this.loadModels();

        // Register CM6 highlight decoration extension
        this.registerTTSEditorExtension();

        // Context menu — state-aware right-click trigger
        this.app.workspace.on("editor-menu", this.addContextMenuItems);

        // TTS command — available in command palette on all platforms, supports hotkey on desktop
        this.addCommand({
            id: "eleven-labs-tts-trigger",
            name: "Read aloud / Pause / Resume",
            checkCallback: (checking: boolean) => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const available = this.audioState !== "idle" || !!view?.editor.getSelection();
                if (available && !checking) {
                    this.handleTTSTrigger();
                }
                return available;
            },
        });

        // Ribbon icon — touch-accessible trigger for mobile
        this.ribbonIconEl = this.addRibbonIcon(
            "audio-lines",
            "Read selected text aloud",
            () => { this.handleTTSTrigger(); }
        );

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new ElevenLabsSettingTab(this.app, this));
    }

    onunload() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.onended = null;
            this.currentAudio = null;
        }
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }
        this.clearTTSHighlight();
        this.audioState = "idle";
        this.app.workspace.off("editor-menu", this.addContextMenuItems);
    }

    async loadVoices() {
        try {
            const response = await ElevenLabsApi.getVoices(
                this.secrets.apiKey
            );
            this.voices = response.json.voices;
        } catch (error) {
            this.voices = [];
        }
    }

    async loadModels() {
        try {
            const response = await ElevenLabsApi.getModels(
                this.secrets.apiKey
            );
            this.models = response.json.filter(
                (m: any) => m.can_do_text_to_speech
            );
        } catch (error) {
            this.models = [];
        }
    }

    async loadSettings() {
        const saved = await this.loadData();
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
        this.secrets = Object.assign(
            {},
            DEFAULT_SECRETS,
            { apiKey: saved?.apiKey ?? "" }
        );
    }

    async saveSettings() {
        await this.saveData({
            ...this.settings,
            apiKey: this.secrets.apiKey,
        });
    }
}
