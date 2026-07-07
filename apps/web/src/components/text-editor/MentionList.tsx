import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useState,
    useRef,
    ForwardRefRenderFunction,
} from 'react'
import { FileText, Target } from 'lucide-react'
import { cn } from '~/lib/utils'

interface MentionListProps {
    items: (any & { resourceType: string })[];
    command: (item: { id: string, label: string }) => void;
}

interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionList: ForwardRefRenderFunction<MentionListRef, MentionListProps> = (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const scrollAreaRef = useRef<HTMLDivElement>(null)

    const selectItem = (index: number) => {
        const item = props.items[index]

        if (item) {
            const resourceType = item.resourceType
            props.command({ id: `${resourceType}:${item.id}`, label: `${resourceType.replace('note', 'note')}:${item.title}` })
        }
    }

    const upHandler = () => {
        if (!props.items.length) return
        setSelectedIndex((prevIndex) => {
            const newIndex = (prevIndex + props.items.length - 1) % props.items.length
            scrollToItem(newIndex)
            return newIndex
        })
    }

    const downHandler = () => {
        if (!props.items.length) return
        setSelectedIndex((prevIndex) => {
            const newIndex = (prevIndex + 1) % props.items.length
            scrollToItem(newIndex)
            return newIndex
        })
    }

    const enterHandler = () => {
        if (!props.items.length) return
        selectItem(selectedIndex)
    }

    const scrollToItem = (index: number) => {
        if (scrollAreaRef.current) {
            const itemHeight = 64 // Approximate height of each item
            const scrollPosition = index * itemHeight
            scrollAreaRef.current.scrollTop = scrollPosition
        }
    }

    useEffect(() => {
        setSelectedIndex(0)
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = 0
        }
    }, [props.items])

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler()
                return true
            }

            if (event.key === 'ArrowDown') {
                downHandler()
                return true
            }

            if (event.key === 'Enter') {
                enterHandler()
                return true
            }

            return false
        },
    }))

    return (
        <div className="z-50 overflow-hidden rounded-[var(--r-3)] border border-border bg-[var(--bg-elev)] p-1 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.95)]">
            <div ref={scrollAreaRef} className="custom-scrollbar flex max-h-[350px] w-[320px] flex-col gap-1 overflow-y-auto">
                {props.items.length
                    ? props.items.map((item, index) => (
                        <button
                            className={cn(
                                'flex w-full flex-col gap-1 rounded-[var(--r-2)] px-3 py-2 text-start text-sm text-foreground transition-colors',
                                index === selectedIndex
                                    ? 'bg-[var(--bg-soft)]'
                                    : 'hover:bg-[var(--bg-soft)]'
                            )}
                            key={item.id}
                            onClick={() => selectItem(index)}
                        >
                            <span className="truncate text-sm font-medium">{item.title}</span>
                            <span className="flex items-center gap-1.5">
                                <span className={cn(
                                    'inline-flex items-center gap-1 rounded-[var(--r-2)] border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em]',
                                    getResourceClassName(item.resourceType)
                                )}>
                                    <MentionIcon type={item.resourceType} />
                                    {item.resourceType.replace('note', 'note')}
                                </span>
                                {item.status && (
                                    <span className={cn(
                                        'inline-flex items-center rounded-[var(--r-2)] border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em]',
                                        item.status === 'completed' ? 'text-[var(--green)]' : 'text-muted-foreground'
                                    )}>
                                        {item.status}
                                    </span>
                                )}
                            </span>
                        </button>
                    ))
                    : <div className="w-full py-3 text-center text-sm text-muted-foreground">No result</div>
                }
            </div>
        </div>
    )
}

export default forwardRef(MentionList)

function MentionIcon({ type }: { type: string }) {
    if (type === 'task') return <Target className="h-3 w-3" />
    return <FileText className="h-3 w-3" />
}

function getResourceClassName(type: string) {
    if (type === 'task') return 'text-[var(--green)]'
    return 'text-[var(--amber)]'
}
