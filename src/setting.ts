import { App, PluginSettingTab, Setting } from 'obsidian';
import locale from 'src/lang';
import AnkiSynchronizer from 'main';

// Plugin Settings
export interface Settings {
  render: boolean;
  linkify: boolean;
  headingLevel: number;
  highlightAsCloze: boolean;
  scanDirectory: string;
}

export const DEFAULT_SETTINGS: Settings = {
  render: true,
  linkify: true,
  headingLevel: 1,
  highlightAsCloze: false,
  scanDirectory: ''
};

export default class AnkiSynchronizerSettingTab extends PluginSettingTab {
  plugin: AnkiSynchronizer;

  constructor(app: App, plugin: AnkiSynchronizer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: locale.settingTabHeader });

    new Setting(this.containerEl)
      .setName(locale.settingRenderName)
      .setDesc(locale.settingRenderDescription)
      .addToggle(v =>
        v.setValue(this.plugin.settings.render).onChange(async value => {
          this.plugin.settings.render = value;
        })
      );

    new Setting(this.containerEl)
      .setName(locale.settingLinkifyName)
      .setDesc(locale.settingLinkifyDescription)
      .addToggle(v =>
        v.setValue(this.plugin.settings.linkify).onChange(async value => {
          this.plugin.settings.linkify = value;
        })
      );

    new Setting(this.containerEl)
      .setName(locale.settingHighlightAsClozeName)
      .setDesc(locale.settingHighlightAsClozeDescription)
      .addToggle(v =>
        v.setValue(this.plugin.settings.highlightAsCloze).onChange(async value => {
          this.plugin.settings.highlightAsCloze = value;
        })
      );

    new Setting(this.containerEl)
      .setName(locale.settingHeadingLevelName)
      .setDesc(locale.settingHeadingLevelDescription)
      .addDropdown(v =>
        v
          .addOptions({
            '1': 'h1',
            '2': 'h2',
            '3': 'h3',
            '4': 'h4',
            '5': 'h5',
            '6': 'h6'
          })
          .setValue(this.plugin.settings.headingLevel.toString())
          .onChange(async value => {
            this.plugin.settings.headingLevel = parseInt(value);
          })
      );
    new Setting(this.containerEl)
      .setName('Scan Directory')
      .setDesc('Directory path to scan for flashcards')
      .addTextArea(text =>{
        text.inputEl.style.minHeight = '50px';
        text.inputEl.style.width = '250px';
        text.inputEl.style.resize = 'vertical'; // 允许拖动调整

        text
          .setPlaceholder('Enter directory path')
          .setValue(this.plugin.settings.scanDirectory)
          .onChange(async value => {
            this.plugin.settings.scanDirectory = value;
          })
        }
      );
  }
}
