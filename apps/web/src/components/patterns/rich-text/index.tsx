import { Editor, EditorContent, ReactRenderer, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import {
  Bold,
  Check,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MessageSquareCode,
  MessageSquareQuote,
  Strikethrough,
  X,
} from "lucide-react";
import { type HTMLAttributes, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import tippy from "tippy.js";
import { tasksQueryOptions, notesQueryOptions } from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { cn } from "~/lib/utils";
import { normalizeRichTextInput } from "~/lib/rich-text";
import MentionList from "./MentionList";

type RichTextSurfaceProps = HTMLAttributes<HTMLDivElement>;

export function RichTextEditorSurface({ className, ...props }: RichTextSurfaceProps) {
  return <div className={cn("overflow-hidden rounded-[var(--r-3)] border border-border bg-background", className)} {...props} />;
}

export function Prose({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  return <article className={cn("note-prose px-4 py-4", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

type RichTextEditorProps = {
  content: string;
  onContentChange: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
  className?: string;
  editorContentClassName?: string;
  withMentions?: boolean;
  onEditorReady?: (editor: Editor | null) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>, editor: Editor | null) => void;
};

type TipTapEditorProps = RichTextEditorProps & {
  title: string;
  onTitleChange: (title: string) => void;
  titleClassName?: string;
};

interface ComponentRef {
  onKeyDown: (props: any) => boolean;
}

export const RichTextEditor = ({
  content,
  onContentChange,
  editable = true,
  placeholder,
  className,
  editorContentClassName,
  withMentions = true,
  onEditorReady,
  onKeyDown,
}: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const { data: tasks } = useQuery({ ...tasksQueryOptions(), enabled: withMentions });
  const { data: notes } = useQuery({ ...notesQueryOptions(), enabled: withMentions });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: !editable,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      ...(withMentions
        ? [
            Mention.configure({
              HTMLAttributes: {
                class: "mention",
              },
              suggestion: {
                items: ({ query }: { query: string }) => {
                  const taskItems = (tasks as any[])?.map((task: any) => ({ ...task, resourceType: "task" })) || [];
                  const noteItems = (notes as any[])?.map((note: any) => ({ ...note, resourceType: "note" })) || [];
                  const initialItems = [...taskItems.slice(0, 3), ...noteItems.slice(0, 3)];

                  if (!query) return initialItems;

                  return [...taskItems, ...noteItems]
                    .filter((item) => item.title?.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 10);
                },
                render: () => {
                  let component: ReactRenderer;
                  let popup: any[];

                  return {
                    onStart: (props) => {
                      component = new ReactRenderer(MentionList, {
                        props,
                        editor: props.editor,
                      });

                      if (!props.clientRect) return;

                      popup = tippy("body", {
                        getReferenceClientRect: props.clientRect as any,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: "manual",
                        placement: "bottom-start",
                      });
                    },
                    onUpdate(props) {
                      component.updateProps(props);

                      if (!props.clientRect) return;

                      popup[0].setProps({
                        getReferenceClientRect: props.clientRect as any,
                      });
                    },
                    onKeyDown(props) {
                      if (props.event?.key === "Escape") {
                        popup[0].hide();
                        return true;
                      }

                      return (component.ref as ComponentRef)?.onKeyDown(props);
                    },
                    onExit() {
                      popup[0].destroy();
                      component.destroy();
                    },
                  };
                },
                command: ({ editor, range, props }) => {
                  editor
                    .chain()
                    .focus()
                    .insertContentAt(range, [
                      {
                        type: "mention",
                        attrs: props,
                      },
                      {
                        type: "text",
                        text: " ",
                      },
                    ])
                    .run();
                },
              },
            }),
          ]
        : []),
    ],
    content: normalizeRichTextInput(content),
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const nextContent = normalizeRichTextInput(content);
    if (nextContent !== editor.getHTML()) {
      editor.commands.setContent(nextContent, false);
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    onEditorReady?.(editor);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  return (
    <div ref={editorRef} className={cn("rich-text-editor relative w-full", className)}>
      {editable && <MenuBar editor={editor} />}
      <EditorContent
        editor={editor}
        aria-label={placeholder}
        onKeyDown={(event) => onKeyDown?.(event, editor)}
        className={cn("w-full", editorContentClassName)}
      />
    </div>
  );
};

export const TipTapEditor = ({
  content,
  onContentChange,
  title,
  onTitleChange,
  editable = true,
  className,
  titleClassName,
  editorContentClassName,
  withMentions = true,
}: TipTapEditorProps) => {
  const titleInputId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<Editor | null>(null);

  return (
    <div className={cn("relative w-full rounded-md px-2 pt-2", className)}>
      <div className="flex w-full flex-col gap-0">
        <input
          ref={titleInputRef}
          type="text"
          id={titleInputId}
          placeholder="Title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className={cn(
            "my-0 w-full border-none bg-transparent px-3 text-xl font-semibold tracking-normal text-foreground placeholder:text-muted-foreground focus:border-none focus:outline-none disabled:cursor-default disabled:opacity-100",
            titleClassName
          )}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              bodyEditorRef.current?.commands.focus();
            }
          }}
          disabled={!editable}
        />
        <RichTextEditor
          content={content}
          onContentChange={onContentChange}
          editable={editable}
          withMentions={withMentions}
          placeholder="Write the details"
          className="note-body-editor mt-3"
          editorContentClassName={cn("-ml-1", editorContentClassName)}
          onEditorReady={(editor) => {
            bodyEditorRef.current = editor;
          }}
          onKeyDown={(event, editor) => {
            if (event.key === "Backspace" && editor?.isEmpty) {
              event.preventDefault();
              titleInputRef.current?.focus();
            }
          }}
        />
      </div>
    </div>
  );
};

type MenuBarProps = {
  editor: Editor | null;
};

const MenuBar = ({ editor }: MenuBarProps) => {
  const [isLinkInputVisible, setIsLinkInputVisible] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [activeState, setActiveState] = useState(() => getEditorActiveState(editor));

  useEffect(() => {
    if (!editor) return;

    const updateActiveState = () => setActiveState(getEditorActiveState(editor));

    updateActiveState();
    editor.on("selectionUpdate", updateActiveState);
    editor.on("transaction", updateActiveState);
    editor.on("update", updateActiveState);

    return () => {
      editor.off("selectionUpdate", updateActiveState);
      editor.off("transaction", updateActiveState);
      editor.off("update", updateActiveState);
    };
  }, [editor]);

  useEffect(() => {
    if (isLinkInputVisible && activeState.link && editor) {
      setLinkUrl(editor.getAttributes("link").href || "");
    } else if (!isLinkInputVisible) {
      setLinkUrl("");
    }
  }, [activeState.link, isLinkInputVisible, editor]);

  if (!editor) return null;

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().unsetLink().run();
      setIsLinkInputVisible(false);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url, target: "_blank" }).run();
    setLinkUrl("");
    setIsLinkInputVisible(false);
  };

  const toolItemClassName =
    "size-7 rounded-[var(--r-2)] p-0 text-muted-foreground hover:bg-[var(--bg-soft)] hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";
  const activeMarkValues = [
    activeState.bold && "bold",
    activeState.italic && "italic",
    activeState.strike && "strike",
    activeState.code && "code",
  ].filter(Boolean) as string[];

  return (
    <div className="rich-text-toolbar flex flex-wrap items-center gap-1 border-b border-border bg-[var(--bg-soft)]/70 px-2 py-1.5">
      <ToggleGroup type="multiple" value={activeMarkValues} className="gap-0.5">
        <ToggleGroupItem
          value="bold"
          aria-label="Toggle bold"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={toolItemClassName}
        >
          <Bold className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="italic"
          aria-label="Toggle italic"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={toolItemClassName}
        >
          <Italic className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="strike"
          aria-label="Toggle strikethrough"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={toolItemClassName}
        >
          <Strikethrough className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="code"
          aria-label="Toggle code"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={toolItemClassName}
        >
          <Code className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      <ToggleGroup
        type="single"
        value={activeState.bulletList ? "bullet" : activeState.orderedList ? "ordered" : ""}
        className="gap-0.5"
      >
        <ToggleGroupItem
          value="bullet"
          aria-label="Toggle bullet list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolItemClassName}
        >
          <List className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="ordered"
          aria-label="Toggle ordered list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolItemClassName}
        >
          <ListOrdered className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      <ToggleGroup
        type="single"
        value={activeState.blockquote ? "blockquote" : activeState.codeBlock ? "codeBlock" : ""}
        className="gap-0.5"
      >
        <ToggleGroupItem
          value="blockquote"
          aria-label="Toggle blockquote"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={toolItemClassName}
        >
          <MessageSquareQuote className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="codeBlock"
          aria-label="Toggle code block"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={toolItemClassName}
        >
          <MessageSquareCode className="h-5 w-5" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Add link"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsLinkInputVisible((visible) => !visible)}
        data-state={activeState.link ? "on" : "off"}
        className={toolItemClassName}
      >
        <LinkIcon className="h-4 w-4" />
      </Button>
      {isLinkInputVisible && (
        <div className="ml-1 flex min-w-[220px] flex-1 items-center gap-1.5">
          <Input
            type="url"
            placeholder="https://mindtab.in"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setIsLinkInputVisible(false);
              }
            }}
            className="h-8 min-w-0 rounded-[var(--r-2)] border-border bg-background text-xs focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button type="button" variant="ghost" size="icon" onClick={applyLink} className="size-8 rounded-[var(--r-2)] text-[var(--tone-status-done)]">
            <Check className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsLinkInputVisible(false);
              setLinkUrl("");
            }}
            className="size-8 rounded-[var(--r-2)] text-[var(--tone-danger)]"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

function getEditorActiveState(editor: Editor | null) {
  return {
    bold: !!editor?.isActive("bold"),
    italic: !!editor?.isActive("italic"),
    strike: !!editor?.isActive("strike"),
    code: !!editor?.isActive("code"),
    bulletList: !!editor?.isActive("bulletList"),
    orderedList: !!editor?.isActive("orderedList"),
    blockquote: !!editor?.isActive("blockquote"),
    codeBlock: !!editor?.isActive("codeBlock"),
    link: !!editor?.isActive("link"),
  };
}
