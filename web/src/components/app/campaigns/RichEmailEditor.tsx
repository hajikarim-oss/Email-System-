import React from "react";
import {
    BoldIcon,
    CodeIcon,
    CornerDownRightIcon,
    EyeIcon,
    ImageIcon,
    ItalicIcon,
    LinkIcon,
    SparklesIcon,
} from "lucide-react";
import { TextInput } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface RichEmailEditorProps {
    subject: string;
    onSubjectChange: (value: string) => void;
    bodyHtml: string;
    bodyPlain: string;
    onBodyChange: (html: string, plain: string) => void;
    isFollowUp?: boolean;
    stepIndex?: number;
    placeholder?: string;
}

function derivePlainText(html: string): string {
    const temp = document.createElement("div");
    temp.innerHTML = html
        .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, "[$1]")
        .replace(/<img\b[^>]*>/gi, "[Image]")
        .replace(/<br\s*[\/]?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n");
    return temp.textContent || temp.innerText || "";
}

export function RichEmailEditor({
    subject,
    onSubjectChange,
    bodyHtml,
    bodyPlain,
    onBodyChange,
    isFollowUp = false,
    stepIndex = 0,
    placeholder = "Hi {{.FirstName}},\n\nNoticed {{.Company}} is ...",
}: RichEmailEditorProps) {
    const [mode, setMode] = React.useState<"visual" | "code">("visual");
    const editorRef = React.useRef<HTMLDivElement>(null);
    const lastHtmlRef = React.useRef<string>(bodyHtml);

    // Initial and external sync to contentEditable
    React.useEffect(() => {
        if (editorRef.current && mode === "visual") {
            const currentDOMHtml = editorRef.current.innerHTML;
            const targetHtml = bodyHtml || (bodyPlain ? `<div>${bodyPlain.replace(/\n/g, "<br/>")}</div>` : "");
            if (currentDOMHtml !== targetHtml && lastHtmlRef.current !== targetHtml) {
                editorRef.current.innerHTML = targetHtml;
                lastHtmlRef.current = targetHtml;
            }
        }
    }, [bodyHtml, bodyPlain, mode]);

    const handleSync = React.useCallback(() => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        lastHtmlRef.current = html;
        const plain = derivePlainText(html);
        onBodyChange(html, plain);
    }, [onBodyChange]);

    const handleInput = () => {
        handleSync();
    };

    const insertHtmlAtCaret = (htmlToInsert: string) => {
        if (mode === "code") {
            const newHtml = (bodyHtml || "") + htmlToInsert;
            onBodyChange(newHtml, derivePlainText(newHtml));
            return;
        }

        if (editorRef.current) {
            editorRef.current.focus();
        }

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const el = document.createElement("div");
            el.innerHTML = htmlToInsert;
            const frag = document.createDocumentFragment();
            let node: Node | null = null;
            let lastNode: Node | null = null;
            while ((node = el.firstChild)) {
                lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } else if (editorRef.current) {
            editorRef.current.innerHTML += htmlToInsert;
        }
        handleSync();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        // 1. Check for image files in clipboard (screenshots, copied image files)
        const items = e.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                            const base64 = evt.target?.result as string;
                            insertHtmlAtCaret(
                                `<p><img src="${base64}" alt="Pasted Image" style="max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; display: block;" /></p>`
                            );
                        };
                        reader.readAsDataURL(file);
                        return;
                    }
                }
            }
        }

        // 2. Check for rich HTML in clipboard (from Gmail, Outlook, Word, Google Docs)
        const html = e.clipboardData?.getData("text/html");
        if (html && html.trim().length > 0) {
            e.preventDefault();
            insertHtmlAtCaret(html);
            return;
        }

        // 3. Plain text fallback preserving paragraphs/breaks
        const text = e.clipboardData?.getData("text/plain");
        if (text) {
            e.preventDefault();
            const formatted = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\n/g, "<br/>");
            insertHtmlAtCaret(formatted);
        }
    };

    const handleInsertVariable = (token: string) => {
        insertHtmlAtCaret(`&nbsp;<span style="background-color: #f0f9ff; color: #0284c7; padding: 1px 4px; border-radius: 4px; font-family: monospace; font-size: 11.5px; border: 1px solid #bae6fd;">${token}</span>&nbsp;`);
    };

    const handleFormat = (cmd: string, val: string = "") => {
        if (mode !== "visual") return;
        if (editorRef.current) editorRef.current.focus();
        document.execCommand(cmd, false, val);
        handleSync();
    };

    const handlePromptImage = () => {
        const url = window.prompt("Enter image URL (e.g. https://.../banner.png):");
        if (url && url.trim()) {
            insertHtmlAtCaret(`<p><img src="${url.trim()}" alt="Image" style="max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0;" /></p>`);
        }
    };

    const handlePromptLink = () => {
        const url = window.prompt("Enter destination URL (e.g. https://...):");
        if (url && url.trim()) {
            handleFormat("createLink", url.trim());
        }
    };

    return (
        <div className="space-y-2">
            {/* Subject line or Thread Notification for Follow-ups */}
            {isFollowUp ? (
                <div className="flex items-center gap-2.5 px-3 py-2 bg-sky-50/70 border border-sky-200/80 rounded-md text-[12px] text-sky-900">
                    <CornerDownRightIcon className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <div>
                        <span className="font-semibold text-sky-800">Same Thread Reply:</span>{" "}
                        <span className="text-sky-700">
                            This follow-up lands in the same email conversation thread as Step 1 (no new subject line).
                        </span>
                    </div>
                </div>
            ) : (
                <TextInput
                    value={subject}
                    onChange={onSubjectChange}
                    placeholder="Subject, e.g. quick idea for {{.Company}}"
                    className="w-full"
                />
            )}

            {/* Formatting & Variable Insertion Toolbar */}
            <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
                    {/* Variable Quick-Add Buttons */}
                    <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
                            Insert:
                        </span>
                        <button
                            type="button"
                            onClick={() => handleInsertVariable("{{.FirstName}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-200 text-slate-700 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-colors shadow-xs"
                            title="Insert contact's first name"
                        >
                            + {"{{.FirstName}}"}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleInsertVariable("{{.Company}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-200 text-slate-700 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-colors shadow-xs"
                            title="Insert contact's company"
                        >
                            + {"{{.Company}}"}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleInsertVariable("{{.role}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-200 text-slate-700 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-colors shadow-xs"
                            title="Insert custom field role / job title"
                        >
                            + {"{{.role}}"}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleInsertVariable("{{if .Company}}at {{.Company}}{{end}}")}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-white border border-slate-200 text-slate-700 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50/50 transition-colors shadow-xs"
                            title="Insert company conditional block"
                        >
                            + {"{{if .Company}}...{{end}}"}
                        </button>
                    </div>

                    {/* Editor Controls: Bold, Italic, Link, Image, Mode Toggle */}
                    <div className="flex items-center gap-1 ml-auto">
                        <button
                            type="button"
                            onClick={() => handleFormat("bold")}
                            className="size-6 rounded text-slate-600 hover:bg-slate-200/70 inline-flex items-center justify-center transition-colors"
                            title="Bold (Ctrl+B)"
                        >
                            <BoldIcon className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleFormat("italic")}
                            className="size-6 rounded text-slate-600 hover:bg-slate-200/70 inline-flex items-center justify-center transition-colors"
                            title="Italic (Ctrl+I)"
                        >
                            <ItalicIcon className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={handlePromptLink}
                            className="size-6 rounded text-slate-600 hover:bg-slate-200/70 inline-flex items-center justify-center transition-colors"
                            title="Insert Link"
                        >
                            <LinkIcon className="w-3 h-3" />
                        </button>
                        <button
                            type="button"
                            onClick={handlePromptImage}
                            className="size-6 rounded text-slate-600 hover:bg-slate-200/70 inline-flex items-center justify-center transition-colors"
                            title="Insert Image by URL"
                        >
                            <ImageIcon className="w-3 h-3" />
                        </button>
                        <div className="h-3 w-px bg-slate-300 mx-1" />
                        <button
                            type="button"
                            onClick={() => setMode(mode === "visual" ? "code" : "visual")}
                            className={cn(
                                "px-2 h-6 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors",
                                mode === "code"
                                    ? "bg-slate-800 text-white"
                                    : "text-slate-600 hover:bg-slate-200/70"
                            )}
                            title="Toggle HTML Source Code view"
                        >
                            {mode === "visual" ? (
                                <>
                                    <CodeIcon className="w-3 h-3" />
                                    HTML
                                </>
                            ) : (
                                <>
                                    <EyeIcon className="w-3 h-3" />
                                    Visual
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Main Editing Area */}
                {mode === "visual" ? (
                    <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleInput}
                        onPaste={handlePaste}
                        data-placeholder={placeholder}
                        className="min-h-[160px] max-h-[360px] overflow-y-auto px-3 py-2.5 bg-white text-[12.5px] text-slate-900 outline-none leading-relaxed focus:ring-0 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none selection:bg-sky-100"
                        style={{
                            minHeight: stepIndex === 0 ? "180px" : "120px",
                        }}
                    />
                ) : (
                    <textarea
                        value={bodyHtml || bodyPlain}
                        onChange={(e) => {
                            const val = e.target.value;
                            onBodyChange(val, derivePlainText(val));
                        }}
                        placeholder="<p>Paste or edit raw HTML email template with inline images here...</p>"
                        className="w-full min-h-[180px] max-h-[360px] p-3 font-mono text-[11.5px] text-slate-800 bg-slate-900/5 outline-none resize-y border-none"
                    />
                )}
            </div>
        </div>
    );
}
