import { normalizePath, Notice, Plugin} from 'obsidian';
import Anki, { AnkiError } from 'src/anki';
import locale from 'src/lang';
import { MediaManager } from 'src/media';
import Note, { NoteManager } from 'src/note';
import AnkiSynchronizerSettingTab, { DEFAULT_SETTINGS, Settings } from 'src/setting';
import { NoteDigest, NoteState, NoteTypeDigest, NoteTypeState } from 'src/state';
import { version } from './package.json';

interface Data {
  version: string;
  settings: Settings;
  noteState: Record<string, NoteDigest>;
  noteTypeState: Record<string, NoteTypeDigest>;
}

export default class AnkiSynchronizer extends Plugin {
  anki = new Anki();
  settings = DEFAULT_SETTINGS;
  mediaManager = new MediaManager();
  noteManager = new NoteManager(this.settings);
  noteState = new NoteState(this);
  noteTypeState = new NoteTypeState(this);

  async onload() {
    // Recover data from local file
    const data: Data | null = await this.loadData();
    if (data) {
      const { settings, noteState, noteTypeState } = data;
      Object.assign(this.settings, settings);
      for (const key in noteState) {
        this.noteState.set(parseInt(key), noteState[key]);
      }
      for (const key in noteTypeState) {
        this.noteTypeState.set(parseInt(key), noteTypeState[key]);
      }
    }
    this.configureUI();
    console.log(locale.onLoad);
  }

  configureUI() {
    // Add import note types command
    this.addCommand({
      id: 'import',
      name: locale.importCommandName,
      callback: async () => await this.importNoteTypes()
    });
    this.addRibbonIcon('enter', locale.importCommandName, async () => await this.importNoteTypes());

    // Add synchronize command
    this.addCommand({
      id: 'synchronize',
      name: locale.synchronizeCommandName,
      callback: async () => await this.synchronize()
    });
    this.addRibbonIcon(
      'sheets-in-box',
      locale.synchronizeCommandName,
      async () => await this.synchronize()
    );

    // Add a setting tab to configure settings
    this.addSettingTab(new AnkiSynchronizerSettingTab(this.app, this));
  }

  // Save data to local file
  save() {
    return this.saveData({
      version: version,
      settings: this.settings,
      noteState: Object.fromEntries(this.noteState),
      noteTypeState: Object.fromEntries(this.noteTypeState)
    });
  }

  async onunload() {
    await this.save();
    console.log(locale.onUnload);
  }

  // Retrieve template information from Obsidian core plugin "Templates"
  getTemplatePath() {
    const templatesPlugin = (this.app as any).internalPlugins?.plugins['templates'];
    if (!templatesPlugin?.enabled) {
      new Notice(locale.templatesNotEnabledNotice);
      return;
    }
    if (templatesPlugin.instance.options.folder === undefined) {
      new Notice(locale.templatesFolderUndefinedNotice);
      return;
    }
    return normalizePath(templatesPlugin.instance.options.folder);
  }

  async importNoteTypes() {
    new Notice(locale.importStartNotice);
    const templatesPath = this.getTemplatePath();
    if (templatesPath === undefined) return;
    this.noteTypeState.setTemplatePath(templatesPath);
    const noteTypesAndIds = await this.anki.noteTypesAndIds();
    if (noteTypesAndIds instanceof AnkiError) {
      new Notice(locale.importFailureNotice);
      return;
    }
    const noteTypes = Object.keys(noteTypesAndIds);
    const noteTypeFields = await this.anki.multi<{ modelName: string }, string[]>(
      'modelFieldNames',
      noteTypes.map(s => ({ modelName: s }))
    );
    if (noteTypeFields instanceof AnkiError) {
      new Notice(locale.importFailureNotice);
      return;
    }
    const state = new Map<number, NoteTypeDigest>(
      noteTypes.map((name, index) => [
        noteTypesAndIds[name],
        {
          name: name,
          fieldNames: noteTypeFields[index]
        }
      ])
    );
    console.log(`Retrieved note type data from Anki`, state);
    await this.noteTypeState.change(state);
    await this.save();
    new Notice(locale.importSuccessNotice);
  }

  async synchronize() {
    const templatesPath = this.getTemplatePath();
    if (templatesPath === undefined) return;
    new Notice(locale.synchronizeStartNotice);

    // allFiles 获取配置目录下的所有 md 文件
    let allFiles = [];
    const scanDirectory = this.settings.scanDirectory;
    if (scanDirectory === '') {
      allFiles = this.app.vault.getMarkdownFiles();  // 缓存所有文件
    } else {
      const directories = scanDirectory.split('\n');
      allFiles = this.app.vault.getMarkdownFiles().filter(file => {
        return directories.some(directory => file.path.startsWith(directory)); // 获取所有指定目录下的所有文件
      });
    }

    const allTopics = new Set<string>(); // 所有的 topic 文件名
    const allMocs = new Set<string>(); // 所有包含 #anki 的文件的 moc 的集合
    const noteMocMap = new Map<string, string>(); // md 文件名 => moc[0]
    const mocPathMap = new Map<string, string>(); // 单个 moc => anki 目录路径

    // 获取所有包含 #anki 的文件
    const ankiFiles = allFiles.filter(file => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return false;

      const frontmatterFolder = cache.frontmatter?.folder;
      if (frontmatterFolder == "Topic"){
        allTopics.add(file.basename)
      }

      let isAnki = false;

      // 1. 检查 frontmatter 中的 tags
      const frontmatterTags = cache.frontmatter?.tags;
      if (frontmatterTags) {
          if (Array.isArray(frontmatterTags)) {
              isAnki = frontmatterTags.includes('anki');
          } else if (typeof frontmatterTags === 'string') {
              isAnki = frontmatterTags === 'anki';
          }
      }
      // 2. 检查行内标签 (#anki)
      if (!isAnki) {
        const tags = cache.tags;
        if (tags) {
          isAnki = tags?.some(tag => tag.tag === '#anki');
        }
      }

      if (isAnki) {
        // 缓存 frontmatter 中的 moc
        const frontmatterMoc = cache.frontmatter?.moc;
        if (frontmatterMoc && frontmatterMoc.length > 0) {
          const currentMoc = frontmatterMoc[0].replace(/\[\[(.+?)\]\]/g, '$1');
          allMocs.add(currentMoc);
          noteMocMap.set(file.basename, currentMoc);
        }
      }

      return isAnki;
   });

   // 获取所有 moc 的全路径
    allMocs.forEach(moc => {
      const currentMocPath = [];
      let currentMoc = moc;
      if (allTopics.has(currentMoc)){
        currentMocPath.push(currentMoc);
      }
      
      // 这里找上级 moc ，需要把上级 moc 也放入 anki 中才行
      while (noteMocMap.has(currentMoc)) {
        const nextMoc = noteMocMap.get(currentMoc);
        if (!nextMoc) break;
        if (allTopics.has(nextMoc)){
          currentMocPath.push(nextMoc);
        } 
        currentMoc = nextMoc;
      }
      currentMocPath.reverse();
      mocPathMap.set(moc, currentMocPath.join('::'))
    });

    // console.log("allTopics",allTopics)
    // console.log("allMocs",allMocs)
    // console.log("noteMocMap",noteMocMap)
    // console.log("mocPathMap",mocPathMap)

    const state = new Map<number, [NoteDigest, Note]>();
    // console.log(ankiFiles)
    for (const file of ankiFiles) {
      // ignore templates
      if (file.path.startsWith(templatesPath)) continue;

      // read and validate content
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter) continue;

      const content = await this.app.vault.read(file);
      const media = this.app.metadataCache.getFileCache(file)?.embeds;

      const [note, mediaNameMap] = this.noteManager.validateNote(
        file,
        frontmatter,
        content,
        media,
        this.noteTypeState,
        mocPathMap
      );
      if (!note) continue;
      if (note.nid === 0) {
        // new file
        const nid = await this.noteState.handleAddNote(note, file);
        if (nid === undefined) {
          new Notice(locale.synchronizeAddNoteFailureNotice(file.basename));
          continue;
        }
        note.nid = nid;
        this.app.vault.modify(file, this.noteManager.dump(note, mediaNameMap));
      }
      state.set(note.nid, [note.digest(), note]);
      if (this.noteState.get(note.nid)?.hash !== note.digest().hash) {
        console.log('update media for note ' + note.basename);
        if (media) {
          for (const item of media) {
            if (!item.link.includes('.') || item.link.includes('.canvas')) {
              continue;
            }
            this.noteState.handleAddMedia(
              this.mediaManager.parseMedia(item, this.app.vault, this.app.metadataCache)
            );
          }
        }
      }
    }
    await this.noteState.change(state);
    await this.save();
    new Notice(locale.synchronizeSuccessNotice);
  }
}
