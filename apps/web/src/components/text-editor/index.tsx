import { Editor, EditorContent, ReactRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link' // Import the Link extension
import Mention from '@tiptap/extension-mention'
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  MessageSquareCode,
  MessageSquareQuote,
  Strikethrough,
  Link as LinkIcon, // Import a link icon
  X,
  Check,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Separator } from '../ui/separator'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { cn } from '~/lib/utils'

import tippy from 'tippy.js'

import { useQuery } from '@tanstack/react-query'
import { goalsQueryOptions, habitsQueryOptions, journalsQueryOptions } from '~/api/hooks'
import MentionList from './MentionList'

type TipTapEditorProps = {
  content: string
  onContentChange: (content: string) => void
  title: string
  onTitleChange: (title: string) => void
  editable?: boolean
  className?: string
  titleClassName?: string
  editorContentClassName?: string
}

interface ComponentRef {
  onKeyDown: (props: any) => boolean;
}

export const TipTapEditor = ({
  content,
  onContentChange,
  title,
  onTitleChange,
  editable = true,
  className,
  titleClassName,
  editorContentClassName,
}: TipTapEditorProps) => {
  const titleInputId = useId()
  const [isMenuVisible, setIsMenuVisible] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const editorRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isLinkInputVisible, setIsLinkInputVisible] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const { data: goals } = useQuery(goalsQueryOptions())
  const { data: habits } = useQuery(habitsQueryOptions())
  const { data: journals } = useQuery(journalsQueryOptions())

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          target: '_blank', // Ensure links open in a new tab
          rel: 'noopener noreferrer',
        },
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }: { query: string }) => {

            // add type to each item, these are used to data-resource-type for mentioned elements
            const goalItems = (goals as any[])?.map((goal: any) => ({ ...goal, resourceType: 'goal' })) || []
            const habitItems = (habits as any[])?.map((habit: any) => ({ ...habit, resourceType: 'habit' })) || []
            const journalItems = (journals as any[])?.map((journal: any) => ({ ...journal, resourceType: 'journal' })) || []

            const initialItems = [...goalItems.slice(0, 2), ...journalItems.slice(0, 2), ...habitItems.slice(0, 2)]

            if (!query) {
              return initialItems
            }

            const items = [...goalItems, ...habitItems, ...journalItems]

            return items
              ?.filter(item => item.title?.toLowerCase().includes(query.toLowerCase()))
              ?.slice(0, 10)
              || []
          },

          render: () => {
            let component: ReactRenderer
            let popup: any[]

            return {
              onStart: (props) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                })

                if (!props.clientRect) {
                  return
                }

                // @ts-ignore
                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                })
              },

              onUpdate(props) {
                component.updateProps(props)

                if (!props.clientRect) {
                  return
                }

                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                })
              },

              onKeyDown(props) {
                if (props.event?.key === 'Escape') {
                  popup[0].hide()

                  return true
                }

                return (component.ref as ComponentRef)?.onKeyDown(props)
              },

              onExit() {
                popup[0].destroy()
                component.destroy()
              },
            }
          },
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                {
                  type: 'mention',
                  attrs: props,
                },
                {
                  type: 'text',
                  text: ' ',
                },
              ])
              .run()
          },
        }
      }),
    ],
    content: content,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML())
    },
    onSelectionUpdate: ({ editor }) => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current)
      }

      selectionTimeoutRef.current = setTimeout(() => {
        const { from, to } = editor.state.selection
        if (from !== to && editorRef.current) {
          const editorRect = editorRef.current.getBoundingClientRect()
          const { rangeRect } = getSelectionRect(editor)

          if (rangeRect) {
            const left = rangeRect.left - editorRect.left
            const top = rangeRect.top - editorRect.top
            setMenuPosition({ x: left, y: top })
            setIsMenuVisible(true)
          }
        } else {
          setIsMenuVisible(false)
        }
      }, 200)
    },
    editable: editable,
    immediatelyRender: false,
  })

  // Sync content prop changes to the editor (useEditor only uses content on init)
  useEffect(() => {
    if (editor && !editor.isDestroyed && content !== editor.getHTML()) {
      editor.commands.setContent(content, false)
    }
  }, [content, editor])

  const getSelectionRect = (editor: Editor) => {
    const { from, to } = editor.state.selection
    const start = editor.view.coordsAtPos(from)
    const end = editor.view.coordsAtPos(to)

    const rangeRect = {
      left: Math.min(start.left, end.left),
      top: Math.min(start.top, end.top),
      right: Math.max(start.right, end.right),
      bottom: Math.max(start.bottom, end.bottom),
    }

    return { rangeRect }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        editorRef.current &&
        !editorRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsMenuVisible(false)
        setIsLinkInputVisible(false) // Hide link input when clicking outside
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current)
      }
    }
  }, [])

  /**
   * This useEffect ensures that when the link input becomes visible,
   * it prepopulates the linkUrl with the current link's href if a link is active.
   */
  useEffect(() => {
    if (isLinkInputVisible && editor?.isActive('link')) {
      const currentLink = editor.getAttributes('link').href || ''
      setLinkUrl(currentLink)
    } else if (!isLinkInputVisible) {
      setLinkUrl('')
    }
  }, [isLinkInputVisible, editor])

  return (
    <div ref={editorRef} className={cn('relative w-full rounded-md px-2 pt-2', className)}>
      <div className="flex flex-col gap-0 w-full">
        <input
          ref={titleInputRef}
          type="text"
          id={titleInputId}
          placeholder="Title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className={cn(
            'my-0 w-full border-none bg-transparent px-3 text-xl font-semibold tracking-normal text-foreground placeholder:text-muted-foreground focus:border-none focus:outline-none disabled:cursor-default disabled:opacity-100',
            titleClassName,
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.commands.focus()
            }
          }}
          disabled={!editable}
        />
        <EditorContent
          editor={editor}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && editor?.isEmpty) {
              e.preventDefault()
              titleInputRef.current?.focus()
            }
          }}
          className={cn('-ml-1 w-full', editorContentClassName)}
        />
      </div>
      {isMenuVisible && editable && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            top: `${menuPosition.y - 15}px`,
            left: `${menuPosition.x}px`,
            zIndex: 50,
            transform: 'translateY(-100%)',
          }}
          className="flex items-center rounded-[var(--r-3)] border border-border bg-[var(--bg-elev)] p-1.5 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]"
        >
          <MenuBar
            editor={editor}
            isLinkInputVisible={isLinkInputVisible}
            setIsLinkInputVisible={setIsLinkInputVisible}
          />
          {isLinkInputVisible && (
            <form
              className="ml-2 flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (linkUrl) {
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange('link')
                    .setLink({ href: linkUrl, target: '_blank' })
                    .run()
                  setLinkUrl('')
                  setIsLinkInputVisible(false)
                }
              }}
            >
              <Input
                type="url"
                placeholder="https://formonce.in"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-8 w-56 rounded-[var(--r-2)] border-border bg-background text-xs focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (linkUrl) {
                    editor
                      ?.chain()
                      .focus()
                      .extendMarkRange('link')
                      .setLink({ href: linkUrl, target: '_blank' })
                      .run()
                    setLinkUrl('')
                    setIsLinkInputVisible(false)
                  }
                }}
                className="size-8 rounded-[var(--r-2)] text-[var(--green)]"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsLinkInputVisible(false)
                  setLinkUrl('')
                }}
                className="size-8 rounded-[var(--r-2)] text-[var(--rose)]"
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

type MenuBarProps = {
  editor: Editor | null
  isLinkInputVisible: boolean
  setIsLinkInputVisible: (visible: boolean) => void
}

const MenuBar = ({
  editor,
  isLinkInputVisible,
  setIsLinkInputVisible,
}: MenuBarProps) => {
  if (!editor) return null

  const toolItemClassName =
    'size-7 rounded-[var(--r-2)] p-0 text-muted-foreground hover:bg-[var(--bg-soft)] hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

  return (
    <div className="flex w-fit items-center gap-1 p-0">
      <ToggleGroup type="multiple" className="gap-0.5">
        <ToggleGroupItem
          value="bold"
          aria-label="Toggle bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-state={editor.isActive('bold') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <Bold className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="italic"
          aria-label="Toggle italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-state={editor.isActive('italic') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <Italic className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="strike"
          aria-label="Toggle strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          data-state={editor.isActive('strike') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <Strikethrough className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="code"
          aria-label="Toggle code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          data-state={editor.isActive('code') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <Code className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      <ToggleGroup
        type="single"
        value={
          editor.isActive('bulletList')
            ? 'bullet'
            : editor.isActive('orderedList')
              ? 'ordered'
              : ''
        }
        className="gap-0.5"
      >
        <ToggleGroupItem
          value="bullet"
          aria-label="Toggle bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={toolItemClassName}
        >
          <List className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="ordered"
          aria-label="Toggle ordered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={toolItemClassName}
        >
          <ListOrdered className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      <ToggleGroup
        type="single"
        value={
          editor.isActive('blockquote')
            ? 'blockquote'
            : editor.isActive('codeBlock')
              ? 'codeBlock'
              : ''
        }
        className="gap-0.5"
      >
        <ToggleGroupItem
          value="blockquote"
          aria-label="Toggle blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          data-state={editor.isActive('blockquote') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <MessageSquareQuote className="h-5 w-5" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="codeBlock"
          aria-label="Toggle codeblock"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          data-state={editor.isActive('codeBlock') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <MessageSquareCode className="h-5 w-5" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator orientation="vertical" className="h-5 bg-border" />
      {/* Link Toggle Button */}
      <ToggleGroup type="single" className="gap-0.5">
        <ToggleGroupItem
          value="link"
          aria-label="Toggle link"
          onClick={() => {
            setIsLinkInputVisible(!isLinkInputVisible)
          }}
          data-state={editor.isActive('link') ? 'on' : 'off'}
          className={toolItemClassName}
        >
          <LinkIcon className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
