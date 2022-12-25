import MarkdownIt from "markdown-it";
import highlightjs from "markdown-it-highlightjs";
import Note from "./note";
import { Settings } from "./setting";

export default class Formatter {
  private settings: Settings;
  private mdit = new MarkdownIt({
    html: true,
    linkify: true,
  }).use(highlightjs);
  private vaultName: string;

  constructor(vaultName: string, settings: Settings) {
    this.vaultName = vaultName;
    this.settings = settings;
  }

  convertWikilink(markup: string) {
    return markup.replace(/!?\[\[(.+?)\]\]/g, (match, basename) => {
      // 增图片解析
      const r = RegExp("(.*)\.[png|jpg|jepg]$","ig")
      const m = basename.match(r) 
      if (m != undefined){
        return `<img src="${basename}">`
      }
      // 双链解析
      const url = `obsidian://open?vault=${encodeURIComponent(this.vaultName)}&file=${encodeURIComponent(basename)}`;
      return `[${basename}](${url})`;
    })
  }

  fetchImages(markup: string) {
    const images: any[] = []
    markup.replace(/!?\[\[(.+?)\]\]/g, (match, basename) => {
      const r = RegExp("(.*)\.[png|jpg|jepg]$","ig")
      const m = basename.match(r) 
      if (m != undefined){
        images.push(basename)
        return basename
      }
    }) 
    return images
  }

  convertHighlightToCloze(markup: string) {
    let index = 0;
    while (markup.match(/==(.+?)==/) !== null) {
      index += 1;
      markup = markup.replace(/==(.+?)==/, (match, content) => {
        return `{{c${index}::${content}}}`
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
    return (index == 0) ? this.mdit.renderInline(markdown) : this.mdit.render(markdown);
  }

  format(note: Note) {
    const fields = note.fields;
    const keys = Object.keys(fields);
    const result: Record<string, string> = {};
    keys.map((key, index) => {
      const linkify = (index == 0) && this.settings.linkify && !note.isCloze();
      const field = linkify ? `[[${fields[key]}]]` : fields[key];
      const markdown = this.markdown(field);
      result[key] = this.settings.render ? this.html(markdown, index) : markdown;
    });
    return result;
  }

  images(note: Note) {
    let images: any[] = []
    const fields = note.fields;
    const keys = Object.keys(fields);
    keys.map((key, index) => {
      const linkify = (index == 0) && this.settings.linkify && !note.isCloze();
      const field = linkify ? `[[${fields[key]}]]` : fields[key];
      const image = this.fetchImages(field);
      if (image.length != 0 ){
        images = images.concat(image)
      }
    }); 
    return images
  }
}
