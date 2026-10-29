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


function sanitizeEmailHtml(rawHtml: string): string {
    if (!rawHtml) return "";
    let html = rawHtml;

    // 1. Strip Mac/Apple Mail & WebKit clipboard artifacts
    html = html.replace(/<br\s+class=["']Apple-interchange-newline["']\s*\/?>/gi, "");
    html = html.replace(/class=["']Apple-[^"']*["']/gi, "");

    // 2. Strip Google Docs internal wrappers, meta tags, and comments
    html = html.replace(/<!--[\s\S]*?-->/gi, "");
    html = html.replace(/<meta[^>]*>/gi, "");
    html = html.replace(/<b\b[^>]*id=["']docs-internal-guid-[^"']*["'][^>]*>([\s\S]*?)<\/b>/gi, "$1");
    html = html.replace(/id=["']docs-internal-guid-[^"']*["']/gi, "");

    // 3. Strip dangerous pre-wrap styles that turn internal newlines into massive blank gaps in Gmail
    html = html.replace(/white-space(?:-collapse)?\s*:\s*(?:pre|pre-wrap|preserve);?/gi, "");

    // 4. Strip messy font families (like Times New Roman) and font sizes (small, 11pt, etc.)
    html = html.replace(/face=["']Times New Roman[^"']*["']/gi, "face=\"Arial, Helvetica, sans-serif\"");
    html = html.replace(/font-family:\s*Times New Roman[^;"]*;?/gi, "font-family: Arial, Helvetica, sans-serif;");

    // 5. Clean up runaway consecutive empty paragraphs or breaks
    html = html.replace(/(?:<p[^>]*>\s*(?:&nbsp;|<br\s*\/?>)?\s*<\/p>\s*){2,}/gi, "<p><br/></p>");
    html = html.replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br/><br/>");
    html = html.replace(/<div>\s*<br\s*\/?>\s*<\/div>\s*<div>\s*<br\s*\/?>\s*<\/div>/gi, "<div><br/></div>");

    // 6. Ensure image safety and prevent layout overflow
    html = html.replace(/<img\b(?![^>]*\breferrerpolicy\b)/gi, "<img referrerpolicy=\"no-referrer\"");

    return html.trim();
}
function ensureNoReferrerImages(html: string): string {
    if (!html) return "";
    return html.replace(/<img\b(?![^>]*\breferrerpolicy\b)/gi, '<img referrerpolicy="no-referrer"');
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
    const [viewTab, setViewTab] = React.useState<"edit" | "preview">("edit");
    const [mode, setMode] = React.useState<"visual" | "code">("visual");
    const editorRef = React.useRef<HTMLDivElement>(null);
    const lastHtmlRef = React.useRef<string>("");

    // Initial and external sync to contentEditable
    React.useEffect(() => {
        if (editorRef.current && mode === "visual" && viewTab === "edit") {
            const rawTarget = bodyHtml || (bodyPlain ? `<div>${bodyPlain.replace(/\n/g, "<br/>")}</div>` : "");
            const targetHtml = ensureNoReferrerImages(rawTarget);
            const isFocused = document.activeElement === editorRef.current;

            if (isFocused) {
                // While user is actively typing, only sync if externally changed
                if (editorRef.current.innerHTML !== targetHtml && lastHtmlRef.current !== targetHtml) {
                    editorRef.current.innerHTML = targetHtml;
                    lastHtmlRef.current = targetHtml;
                }
            } else {
                // Initial mount or external data update: always populate DOM innerHTML
                if (editorRef.current.innerHTML !== targetHtml) {
                    editorRef.current.innerHTML = targetHtml;
                    lastHtmlRef.current = targetHtml;
                }
            }
        }
    }, [bodyHtml, bodyPlain, mode, viewTab]);

    const handleSync = React.useCallback(() => {
        if (!editorRef.current) return;
        const rawHtml = editorRef.current.innerHTML;
        const cleanHtml = cleanVariableBadges(rawHtml);
        lastHtmlRef.current = cleanHtml;
        const plain = derivePlainText(cleanHtml);
        onBodyChange(cleanHtml, plain);
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
            insertHtmlAtCaret(sanitizeEmailHtml(html));
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

    const cleanVariableBadges = (html: string): string => {
        if (!html) return "";
        return html
            .replace(/<span[^>]*style="[^"]*(?:background|border|monospace)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
            .replace(/<span[^>]*class="[^"]*(?:variable-badge|token-badge)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1");
    };

    const handleInsertVariable = (token: string) => {
        // Insert clean, natural inline variable without any artificial badge styling, borders, or monospace
        insertHtmlAtCaret(` ${token} `);
    };

    const handleInsertSubjectVariable = (token: string) => {
        const trimmed = subject ? subject.trim() : "";
        const space = trimmed.length > 0 ? " " : "";
        onSubjectChange(trimmed + space + token);
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
            insertHtmlAtCaret(`<p><img src="${url.trim()}" referrerpolicy="no-referrer" alt="Image" style="max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0;" /></p>`);
        }
    };

    const handlePromptLink = () => {
        const url = window.prompt("Enter destination URL (e.g. https://...):");
        if (url && url.trim()) {
            handleFormat("createLink", url.trim());
        }
    };

    // Render preview with sample contact tokens replaced smoothly
    const renderEvaluatedContent = (rawText: string) => {
        if (!rawText) return "";
        let out = cleanVariableBadges(rawText);
        // Ensure no-referrer policy on all images in preview so Google-hosted signatures load
        out = ensureNoReferrerImages(out);
        // Evaluate conditionals like {{if .Company}}...{{end}}
        out = out.replace(/\{\{\s*if\s+\.?Company\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/gi, "$1");
        // Replace variable tokens seamlessly matching paragraph typography
        out = out.replace(/\{\{\s*(\.?FirstName|firstName|first_name)\s*\}\}/gi, "Karim");
        out = out.replace(/\[\s*(First\s*Name|Name)\s*\]/gi, "Karim");
        out = out.replace(/\{\{\s*(\.?LastName|lastName|last_name)\s*\}\}/gi, "Beldaar");
        out = out.replace(/\[\s*(Last\s*Name|Surname)\s*\]/gi, "Beldaar");
        out = out.replace(/\{\{\s*(\.?Company|company|company_name|brand)\s*\}\}/gi, "PhonePe");
        out = out.replace(/\[\s*(Company\s*Name|Company|Brand\s*Name|Brand)\s*\]/gi, "PhonePe");
        out = out.replace(/\{\{\s*(\.?role|role|\.?Title|title)\s*\}\}/gi, "Marketing Partnerships");
        out = out.replace(/\[\s*(Job\s*Title|Title|Role)\s*\]/gi, "Marketing Partnerships");
        return out;
    };

    
    const handleFixSpacing = () => {
        const currentHtml = editorRef.current ? editorRef.current.innerHTML : (bodyHtml || "");
        const sanitized = sanitizeEmailHtml(currentHtml);
        if (editorRef.current) {
            editorRef.current.innerHTML = sanitized;
        }
        onBodyChange(sanitized, derivePlainText(sanitized));
    };

    const handleInsertSignature = (who: "vatsal" | "snehal") => {
        const sig = who === "vatsal" ? `
<div style="margin-top: 18px; font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; color: #444444; line-height: 1.4;">
  <p style="margin: 0 0 2px 0; color: #888888; font-size: 13px;">Thank You</p>
  <p style="margin: 0 0 4px 0; color: #888888; font-size: 13px;">Kind Regards</p>
  <p style="margin: 0 0 2px 0; color: #555555; font-size: 13px;">Brands Partnerships Executive</p>
  <p style="margin: 0 0 2px 0; color: #555555; font-size: 13px;">88284 60424</p>
  <p style="margin: 0 0 8px 0;"><a href="https://www.theboredmonkey.com" target="_blank" style="color: #1155cc; text-decoration: underline; font-size: 13px;">www.theboredmonkey.com</a></p>
  <div style="margin-top: 6px;">
    <a href="https://www.theboredmonkey.com" target="_blank" style="display: block; text-decoration: none; margin-bottom: 6px;">
      <img referrerpolicy="no-referrer" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yodueS0TJvwOgcLdSfhmbwGCiLGM59x4KSMKgSGehDUu_WTpJpBePnKhA1bVnk-WyVGDPD32XEmmRF" width="96" height="24" alt="TheBoredMonkey" style="display: block; border: 0;" />
    </a>
    <img referrerpolicy="no-referrer" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yht7X8br1K9tiI9YpjWY1Sg1ZD2BCFODhgKUeB3_U66VPxN0_6OTgPAJJu7lecH356Qyh6L-rkKMOY" width="220" height="26" alt="Portfolio Brands" style="display: block; border: 0;" />
  </div>
</div>` : `
<div style="margin-top: 18px; font-family: Arial, Helvetica, sans-serif; font-size: 13.5px; color: #444444; line-height: 1.4;">
  <p style="margin: 0 0 3px 0; color: #333333; font-size: 13px;">Kind Regards,</p>
  <p style="margin: 0 0 3px 0; color: #333333; font-size: 13px;">Brand Partnerships l TheBoredMonkey</p>
  <p style="margin: 0 0 8px 0; color: #333333; font-size: 13px;">Contact: <a href="tel:+919136852949" style="color: #1155cc; text-decoration: underline;">+91 9136852949</a></p>
  <div style="margin-top: 6px;">
    <a href="https://www.theboredmonkey.com" target="_blank" style="display: block; text-decoration: none; margin-bottom: 6px;">
      <img referrerpolicy="no-referrer" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yodueS0TJvwOgcLdSfhmbwGCiLGM59x4KSMKgSGehDUu_WTpJpBePnKhA1bVnk-WyVGDPD32XEmmRF" width="96" height="24" alt="TheBoredMonkey" style="display: block; border: 0;" />
    </a>
    <img referrerpolicy="no-referrer" src="https://ci3.googleusercontent.com/mail-sig/AIorK4yht7X8br1K9tiI9YpjWY1Sg1ZD2BCFODhgKUeB3_U66VPxN0_6OTgPAJJu7lecH356Qyh6L-rkKMOY" width="220" height="26" alt="Portfolio Brands" style="display: block; border: 0;" />
  </div>
</div>`;
        insertHtmlAtCaret(sig);
    };;

    return (
        <div className="space-y-2.5">
            {/* Top Toolbar: Editor vs Actual Email Preview Switcher */}
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/80 text-[11.5px] font-medium">
                    <button
                        type="button"
                        onClick={() => setViewTab("edit")}
                        className={cn(
                            "px-3 py-1 rounded-md transition-all",
                            viewTab === "edit"
                                ? "bg-white text-slate-900 shadow-xs font-semibold"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        ✍ Compose
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewTab("preview")}
                        className={cn(
                            "px-3 py-1 rounded-md inline-flex items-center gap-1.5 transition-all",
                            viewTab === "preview"
                                ? "bg-white text-slate-900 shadow-xs font-semibold"
                                : "text-slate-600 hover:text-slate-900"
                        )}
                    >
                        <EyeIcon className="w-3.5 h-3.5" />
                        Preview Email
                    </button>
                </div>

                <div className="text-[11px] text-slate-500">
                    {viewTab === "preview" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            ● Live lead preview: Rajdeep More (TheBoredMonkey)
                        </span>
                    ) : (
                        <span>Rich formatting & template variables enabled</span>
                    )}
                </div>
            </div>

            {viewTab === "preview" ? (
                /* Actual Email Inbox Preview View */
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                    {/* Email Header */}
                    <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="size-9 rounded-full bg-linear-to-tr from-[#FFF9DB] to-indigo-600 text-white font-semibold flex items-center justify-center text-[13px] shadow-xs">
                                    HK
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-semibold text-slate-900">Haji Karim</span>
                                        <span className="text-[11.5px] text-slate-400">&lt;haji.karim@theboredmonkey.com&gt;</span>
                                    </div>
                                    <div className="text-[11.5px] text-slate-500">
                                        To: <span className="text-slate-800 font-medium">Rajdeep More</span> &lt;hajikarimbeldaar@gmail.com&gt;
                                    </div>
                                </div>
                            </div>
                            <span className="text-[11px] text-slate-400 shrink-0">Today, 10:45 AM</span>
                        </div>

                        {!isFollowUp && (
                            <div className="mt-2.5 pt-2 border-t border-slate-200/60">
                                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mr-2">Subject:</span>
                                <span className="text-[13px] font-medium text-slate-900">
                                    {renderEvaluatedContent(subject) || "(No Subject)"}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Email Body Content */}
                    <div className="p-4 sm:p-5 text-[13px] text-slate-800 leading-relaxed min-h-[180px] bg-white">
                        {bodyHtml ? (
                            <div
                                dangerouslySetInnerHTML={{
                                    __html: renderEvaluatedContent(bodyHtml),
                                }}
                                className="space-y-3 [&_img]:max-w-full [&_img]:rounded-md [&_a]:text-slate-900 [&_a]:underline"
                            />
                        ) : bodyPlain ? (
                            <div className="whitespace-pre-wrap font-sans">
                                {renderEvaluatedContent(bodyPlain)}
                            </div>
                        ) : (
                            <div className="text-slate-400 italic py-6 text-center">
                                No email body content entered yet. Switch back to Compose to write your message.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                /* Compose View */
                <>
                    {/* Subject line with dedicated smart variable buttons */}
                    {isFollowUp ? (
                        <div className="flex items-center gap-2.5 px-3 py-2 bg-[#FFF9DB]/70 border border-amber-200/80 rounded-md text-[12px] text-slate-900">
                            <CornerDownRightIcon className="w-3.5 h-3.5 text-slate-900 shrink-0" />
                            <div>
                                <span className="font-semibold text-slate-900">Same Thread Reply:</span>{" "}
                                <span className="text-slate-900">
                                    This follow-up lands in the same email conversation thread as Step 1 (no new subject line).
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <label className="text-[11.5px] font-semibold text-slate-700">
                                    Subject line:
                                </label>
                                <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-0.5">
                                        Insert into subject:
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleInsertSubjectVariable("{{firstName}}")}
                                        className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                        title="Insert contact's first name into subject"
                                    >
                                        + {"{{firstName}}"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInsertSubjectVariable("{{lastName}}")}
                                        className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                        title="Insert contact's last name/surname into subject"
                                    >
                                        + {"{{lastName}}"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInsertSubjectVariable("{{company}}")}
                                        className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                        title="Insert contact's company/brand into subject"
                                    >
                                        + {"{{company}}"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleInsertSubjectVariable("{{title}}")}
                                        className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                        title="Insert job title/role into subject"
                                    >
                                        + {"{{title}}"}
                                    </button>
                                </div>
                            </div>
                            <TextInput
                                value={subject}
                                onChange={onSubjectChange}
                                placeholder="Subject, e.g. Partnership discussion with {{company}}"
                                className="w-full"
                            />
                        </div>
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
                                    onClick={() => handleInsertVariable("{{firstName}}")}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                    title="Insert contact's first name"
                                >
                                    + {"{{firstName}}"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertVariable("{{lastName}}")}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                    title="Insert contact's last name / surname"
                                >
                                    + {"{{lastName}}"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertVariable("{{company}}")}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                    title="Insert contact's company or brand"
                                >
                                    + {"{{company}}"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertVariable("{{title}}")}
                                    className="px-2 py-0.5 rounded text-[11px] font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-amber-200 hover:bg-[#FFF9DB] transition-colors shadow-xs"
                                    title="Insert contact's role or job title"
                                >
                                    + {"{{title}}"}
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
                        
                                <div className="h-3 w-px bg-slate-300 mx-0.5" />
                                <button
                                    type="button"
                                    onClick={handleFixSpacing}
                                    className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100 transition-colors inline-flex items-center gap-1 shadow-xs"
                                    title="Auto-clean formatting, remove Google Docs artifacts, and fix spacing"
                                >
                                    <SparklesIcon className="w-3 h-3 text-amber-600" />
                                    Fix Spacing
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertSignature("vatsal")}
                                    className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors inline-flex items-center gap-1 shadow-xs"
                                    title="Insert Vatsal Vadecha signature table"
                                >
                                    + Vatsal Sig
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleInsertSignature("snehal")}
                                    className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-colors inline-flex items-center gap-1 shadow-xs"
                                    title="Insert Snehal Maurya signature table"
                                >
                                    + Snehal Sig
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
                        className="min-h-[160px] max-h-[360px] overflow-y-auto px-3 py-2.5 bg-white text-[14px] text-slate-900 outline-none leading-[1.5] focus:ring-0 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none selection:bg-[#FFF3B0]"
                        style={{
                            minHeight: stepIndex === 0 ? "180px" : "120px", fontFamily: "Arial, Helvetica, sans-serif", fontSize: "14px", lineHeight: "1.5", color: "#222222",
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
        </>
    )}
</div>
);
}
