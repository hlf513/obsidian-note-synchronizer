import MarkdownIt from 'markdown-it';
import highlightjs from 'markdown-it-highlightjs';
import Note from './note';
import { Settings } from './setting';

export default class Formatter {
  private settings: Settings;
  private mdit = new MarkdownIt({
    html: true,
    linkify: true
  }).use(highlightjs);
  private vaultName: string;

  constructor(vaultName: string, settings: Settings) {
    this.vaultName = vaultName;
    this.settings = settings;
  }

  convertWikilink(markup: string) {
    return markup.replace(/!?\[\[(.+?)\]\]/g, (match, basename) => {
      // console.log("wikilink-match:",match);
      // console.log("wikilink:",basename);
      // fixed 别名显示及跳转问题
      let display = basename;
      if (basename.includes('|')) {
        const path = basename.replace('\\', '').split('|');
        basename = path[0];
        display = path[1];
      }
      // 判断是否是#开头的内部标题跳转
      if (basename.includes('#') && basename.split('#')[0] == '') {
        return `${basename}`;
      }
      // 判断是否包含时间戳#t=
      // 示例：DJ 音标.mp4#t=04:54.19|/dz/
      let timestamp = '';
      if (basename.includes('#t=')) {
        const parts = basename.split('#t=');
        basename = parts[0];
        timestamp = '#t=' + parts[1];
      }
      
      const url = `obsidian://open?vault=${encodeURIComponent(
        this.vaultName
      )}&file=${encodeURIComponent(basename)}${timestamp}`;
      return `[${display}](${url})`;
    });
  }

  convertHighlightToCloze(markup: string) {
    let index = 0;
    while (markup.match(/==(.+?)==/) !== null) {
      index += 1;
      markup = markup.replace(/==(.+?)==/, (match, content) => {
        return `{{c${index}::${content}}}`;
      });
    }
    return markup;
  }

  markdown(markup: string) {
    markup = this.convertWikilink(markup);
    if (this.settings.highlightAsCloze) {
      markup = this.convertHighlightToCloze(markup);
    }
    return markup;
  }

  convertMathDelimiter(markdown: string) {
    markdown = markdown.replace(/\$(.+?)\$/g, '\\\\($1\\\\)');
    markdown = markdown.replace(/\$\$(.+?)\$\$/gs, '\\\\[$1\\\\]');
    return markdown;
  }

  html(markdown: string, index: number) {
    markdown = this.convertMathDelimiter(markdown);
    return index == 0 ? this.mdit.renderInline(markdown) : this.mdit.render(markdown);
  }

  format(note: Note) {
    const fields = note.fields;
    const keys = Object.keys(fields);
    const result: Record<string, string> = {};
    keys.map((key, index) => {
      const linkify = index == 0 && this.settings.linkify && !note.isCloze();
      const field = linkify ? `[[${fields[key]}]]` : fields[key];
      const markdown = this.markdown(field);
      // console.log("markdown",markdown)
      result[key] = this.settings.render ? this.html(markdown, index) : markdown;
    });
    return result;
  }
}
