import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  Check,
  Copy,
  FileText,
  GraduationCap,
  Maximize2,
  MessageSquare,
  Minimize2,
  RotateCcw,
  Send,
  Square,
  User,
} from 'lucide-react';
import {
  Announcement,
  Classroom,
  PageRoute,
  SchoolSettings,
  Student,
  Subject,
  TeachingAssignment,
  UserRole,
} from '../../types/siakad';
import {
  ANIMATION_EASE,
  ERROR_SHAKE_VARIANTS,
  scaledDuration,
  useAdaptiveMotion,
} from '../../config/animations';
import { MotionModal } from '../ui/MotionPrimitives';
import { postAiJson } from '../../utils/aiFetch';

type TopicKey = 'semua' | 'jadwal' | 'kurikulum' | 'administrasi';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
}

interface StudentAssistantChatbotProps {
  schoolSettings: SchoolSettings;
  effectiveRole: UserRole;
  userName: string;
  currentStudent: Student | null;
  assignments: TeachingAssignment[];
  scopedAssignments: TeachingAssignment[];
  subjects: Subject[];
  classes: Classroom[];
  announcements: Announcement[];
  onNavigate: (route: PageRoute) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const TOPIC_TABS: Array<{
  key: TopicKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'semua', label: 'Semua Topik', icon: MessageSquare },
  { key: 'jadwal', label: 'Jadwal Pelajaran', icon: CalendarDays },
  { key: 'kurikulum', label: 'Kurikulum Paket A/B/C', icon: BookOpen },
  { key: 'administrasi', label: 'Administrasi', icon: FileText },
];

/**
 * Render formatted Indonesian prose (bold, bullet lists, numbered lists, line breaks)
 * safely as React elements without innerHTML.
 */
function renderInlineBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function FormattedMessageText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: Array<{ ordered: boolean; content: string; marker?: string }> = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    if (isOrdered) {
      blocks.push(
        <ol
          key={`${keyPrefix}-ol`}
          className="my-1.5 space-y-1 pl-5 list-decimal text-slate-700 dark:text-slate-200"
        >
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineBold(item.content)}
            </li>
          ))}
        </ol>
      );
    } else {
      blocks.push(
        <ul
          key={`${keyPrefix}-ul`}
          className="my-1.5 space-y-1 pl-4 list-disc text-slate-700 dark:text-slate-200"
        >
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {renderInlineBold(item.content)}
            </li>
          ))}
        </ul>
      );
    }
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(`l-${idx}`);
      return;
    }

    const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
    const orderedMatch = line.match(/^(\d+)[.)]\s+(.+)$/);
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);

    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) {
        flushList(`l-${idx}`);
      }
      listItems.push({ ordered: false, content: bulletMatch[1] });
    } else if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) {
        flushList(`l-${idx}`);
      }
      listItems.push({ ordered: true, content: orderedMatch[2], marker: orderedMatch[1] });
    } else if (headingMatch) {
      flushList(`l-${idx}`);
      blocks.push(
        <p
          key={`h-${idx}`}
          className="mt-2 mb-1 font-display font-bold text-slate-900 dark:text-white"
        >
          {renderInlineBold(headingMatch[1])}
        </p>
      );
    } else {
      flushList(`l-${idx}`);
      blocks.push(
        <p key={`p-${idx}`} className="leading-relaxed [&:not(:first-child)]:mt-1.5">
          {renderInlineBold(line)}
        </p>
      );
    }
  });

  flushList('end');

  return <div className="text-xs sm:text-[13.5px] space-y-1">{blocks}</div>;
}

export const StudentAssistantChatbot: React.FC<StudentAssistantChatbotProps> = ({
  schoolSettings,
  effectiveRole,
  userName,
  currentStudent,
  assignments,
  scopedAssignments,
  subjects,
  classes,
  announcements,
  onNavigate,
  inputRef,
}) => {
  const motionProfile = useAdaptiveMotion();
  const [activeTopic, setActiveTopic] = useState<TopicKey>('semua');
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const expandedScrollRef = useRef<HTMLDivElement | null>(null);
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedInputRef = inputRef || localInputRef;

  const welcomeMessage: ChatMessage = useMemo(() => {
    const studentInfo =
      effectiveRole === 'murid' && currentStudent
        ? ` untuk kelas **${currentStudent.className}** (${currentStudent.paket})`
        : '';
    return {
      id: 'welcome-msg',
      role: 'model',
      text: `Halo **${userName}**! Saya Asisten Siswa ${schoolSettings.schoolName}. Saya siap membantu menjawab pertanyaan seputar **jadwal pelajaran**${studentInfo}, **kurikulum Paket A, B, dan C**, serta **prosedur administrasi sekolah**. Silakan pilih pertanyaan cepat di bawah atau ketik pertanyaan Anda.`,
      createdAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [effectiveRole, currentStudent, userName, schoolSettings.schoolName]);

  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);

  // Keep initial welcome synced if user changes without ongoing chat
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].id === 'welcome-msg' ? [welcomeMessage] : prev
    );
  }, [welcomeMessage]);

  useEffect(() => {
    const el = expanded ? expandedScrollRef.current : scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming, expanded]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const quickPrompts = useMemo(() => {
    const classLabel =
      effectiveRole === 'murid' && currentStudent
        ? `kelas ${currentStudent.className}`
        : 'Paket A, B, dan C';

    const byTopic: Record<TopicKey, string[]> = {
      semua: [
        `Apa jadwal pelajaran ${classLabel} minggu ini?`,
        'Apa perbedaan kurikulum Paket A, Paket B, dan Paket C?',
        'Bagaimana prosedur mengurus Surat Keterangan Siswa Aktif?',
        'Bagaimana cara izin tidak masuk dan syarat nilai KKTP?',
      ],
      jadwal: [
        `Tampilkan jadwal pelajaran ${classLabel} beserta tutornya`,
        'Kapan saja jadwal belajar tatap muka dan tutorial berlangsung?',
        'Siapa tutor pengampu mata pelajaran Bahasa Indonesia dan Matematika?',
      ],
      kurikulum: [
        'Apa saja mata pelajaran wajib, pemberdayaan, dan keterampilan di Paket A/B/C?',
        'Jelaskan sistem SKK dan moda belajar (Tatap Muka, Tutorial, Mandiri) di PKBM',
        'Berapa standar nilai ketuntasan (KKTP/KKM) mata pelajaran di sekolah ini?',
      ],
      administrasi: [
        'Apa saja syarat berkas pendaftaran warga belajar baru (PPDB)?',
        'Bagaimana prosedur mengurus Surat Keterangan Aktif dan legalisir ijazah?',
        'Bagaimana alur izin sakit/tidak masuk dan mengikuti remedial ujian?',
      ],
    };

    return byTopic[activeTopic];
  }, [activeTopic, effectiveRole, currentStudent]);

  const schoolContextPayload = useMemo(() => {
    const relevantSchedules =
      effectiveRole === 'murid' && scopedAssignments.length > 0
        ? [
            ...scopedAssignments,
            ...assignments.filter((a) => !scopedAssignments.some((sa) => sa.id === a.id)).slice(0, 20),
          ]
        : assignments;

    return {
      school: {
        schoolName: schoolSettings.schoolName,
        npsn: schoolSettings.npsn,
        address: schoolSettings.address,
        phone: schoolSettings.phone || '-',
        email: schoolSettings.email || '-',
        headmasterName: schoolSettings.headmasterName,
        academicYear: schoolSettings.academicYear,
        semester: schoolSettings.semester,
      },
      user: {
        name: userName,
        role: effectiveRole,
        paket: currentStudent?.paket || '',
        className: currentStudent?.className || '',
      },
      schedules: relevantSchedules
        .filter((a) => a.status === 'Aktif')
        .slice(0, 60)
        .map((a) => ({
          paket: a.paket,
          className: a.className,
          subjectName: a.subjectName,
          teacherName: a.teacherName,
          scheduleDay: a.scheduleDay,
          scheduleTime: a.scheduleTime,
        })),
      subjects: subjects
        .filter((s) => s.status === 'Aktif')
        .slice(0, 60)
        .map((s) => ({
          code: s.code,
          name: s.name,
          paket: s.paket,
          category: s.category,
          hoursPerWeek: s.hoursPerWeek,
          kkm: s.kkm,
        })),
      classes: classes
        .filter((c) => c.status === 'Aktif')
        .slice(0, 25)
        .map((c) => ({
          name: c.name,
          paket: c.paket,
          gradeLevel: c.gradeLevel,
          homeroomTeacherName: c.homeroomTeacherName,
        })),
      announcements: announcements.slice(0, 6).map((a) => ({
        title: a.title,
        category: a.category,
        content: a.content,
      })),
    };
  }, [
    schoolSettings,
    userName,
    effectiveRole,
    currentStudent,
    scopedAssignments,
    assignments,
    subjects,
    classes,
    announcements,
  ]);

  const handleStopStreaming = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  };

  const handleResetChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
    setErrorMsg(null);
    setLastFailedPrompt(null);
    setMessages([welcomeMessage]);
  };

  const handleCopyMessage = async (msgId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId((prev) => (prev === msgId ? null : prev)), 1800);
    } catch {
      // Ignore clipboard rejection in restricted frames
    }
  };

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isStreaming) return;

    setErrorMsg(null);
    setLastFailedPrompt(null);
    setInputValue('');

    const timestamp = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: timestamp,
    };

    const assistantId = `a-${Date.now() + 1}`;
    const placeholderAssistant: ChatMessage = {
      id: assistantId,
      role: 'model',
      text: '',
      createdAt: timestamp,
    };

    const historyForApi = [...messages.filter((m) => m.id !== 'welcome-msg'), userMsg].map(
      (m) => ({
        role: m.role,
        text: m.text,
      })
    );

    setMessages((prev) => [...prev, userMsg, placeholderAssistant]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const runJsonFallback = async (): Promise<string> => {
      const fallbackResult = await postAiJson<{ text?: string; message?: string }>(
        '/api/assistant/chat',
        {
          messages: historyForApi,
          context: schoolContextPayload,
          stream: false,
        },
        { timeoutMs: 65_000, retries: 1, signal: controller.signal }
      );
      if (!fallbackResult.ok || !fallbackResult.data?.text?.trim()) {
        throw new Error(
          fallbackResult.errorMessage ||
            'Gagal menghubungi Asisten Siswa AI. Silakan coba kembali.'
        );
      }
      return fallbackResult.data.text.trim();
    };

    try {
      let accumulated = '';
      let needFallback = false;

      try {
        const response = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          body: JSON.stringify({
            messages: historyForApi,
            context: schoolContextPayload,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let serverMsg = 'Gagal menghubungi Asisten Siswa AI. Silakan coba lagi.';
          try {
            const errJson = await response.json();
            if (errJson?.message) serverMsg = errJson.message;
          } catch {
            // Use default message
          }
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            needFallback = true;
          } else {
            throw new Error(serverMsg);
          }
        } else {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await response.json();
            const reply = String(json.text || '').trim();
            if (!reply) {
              needFallback = true;
            } else {
              accumulated = reply;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, text: reply } : m))
              );
            }
          } else if (!response.body || typeof response.body.getReader !== 'function') {
            needFallback = true;
          } else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) continue;
                const payloadStr = line.slice(5).trim();
                if (!payloadStr) continue;

                try {
                  const payload = JSON.parse(payloadStr) as {
                    text?: string;
                    error?: string;
                    done?: boolean;
                  };
                  if (payload.error) {
                    throw new Error(payload.error);
                  }
                  if (payload.text) {
                    accumulated += payload.text;
                    setMessages((prev) =>
                      prev.map((m) => (m.id === assistantId ? { ...m, text: accumulated } : m))
                    );
                  }
                } catch (parseErr) {
                  if (
                    parseErr instanceof Error &&
                    parseErr.message !== 'Unexpected end of JSON input'
                  ) {
                    throw parseErr;
                  }
                }
              }
            }

            if (!accumulated.trim()) {
              needFallback = true;
            }
          }
        }
      } catch (streamErr) {
        if ((streamErr as { name?: string })?.name === 'AbortError') {
          throw streamErr;
        }
        // Jika SSE streaming gagal di browser HP sebelum menerima teks, otomatis fallback ke mode JSON
        if (!accumulated.trim()) {
          needFallback = true;
        } else {
          throw streamErr;
        }
      }

      if (needFallback && !accumulated.trim()) {
        const reply = await runJsonFallback();
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, text: reply } : m))
        );
      }
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.text.trim()))
        );
      } else {
        const msg =
          err instanceof Error
            ? err.message
            : 'Terjadi kendala koneksi ke layanan Asisten Siswa AI.';
        setErrorMsg(msg);
        setLastFailedPrompt(trimmed);
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && !m.text.trim()))
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(inputValue);
  };

  const renderChatSurface = (isModalView: boolean) => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-700 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate">
              Asisten Siswa AI
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Jadwal pelajaran · Kurikulum Paket A/B/C · Administrasi sekolah
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleResetChat}
            disabled={messages.length <= 1 && !errorMsg}
            title="Mulai percakapan baru"
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-45 disabled:pointer-events-none transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={isModalView ? 'Perkecil tampilan asisten' : 'Perluas tampilan asisten'}
            title={isModalView ? 'Perkecil tampilan' : 'Perluas tampilan'}
            className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center shrink-0"
          >
            {isModalView ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Topic Segmented Tabs + Quick-Start Questions */}
      <div className="py-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
        <div
          role="tablist"
          aria-label="Kategori topik asisten siswa"
          className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto"
        >
          {TOPIC_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTopic === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTopic(tab.key)}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isStreaming}
              onClick={() => void sendMessage(prompt)}
              className="min-h-[34px] px-3 py-1.5 rounded-lg border border-emerald-950/10 dark:border-white/10 bg-[#FAFAF7] dark:bg-slate-800/60 hover:border-emerald-600 dark:hover:border-emerald-500 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/40 text-xs font-medium text-slate-700 dark:text-slate-200 text-left transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Thread */}
      <div
        ref={isModalView ? expandedScrollRef : scrollContainerRef}
        className={`flex-1 overflow-y-auto py-4 space-y-3.5 pr-1 ${
          isModalView ? 'min-h-[320px] max-h-[55vh]' : 'min-h-[260px] max-h-[360px]'
        }`}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isEmptyStreaming = !isUser && !msg.text && isStreaming;
            return (
              <motion.div
                key={msg.id}
                initial={motionProfile.reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={motionProfile.reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{
                  duration: scaledDuration(0.22 * motionProfile.durationMultiplier, 0.28),
                  ease: ANIMATION_EASE.smoothOut,
                }}
                className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200/70 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-emerald-700 text-white rounded-tr-sm'
                      : 'bg-[#FAFAF7] dark:bg-slate-800/80 border border-emerald-950/10 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {isEmptyStreaming ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex gap-1" aria-hidden="true">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.2s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce [animation-delay:-0.1s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-bounce" />
                      </span>
                      <span>Sedang menyiapkan jawaban...</span>
                    </div>
                  ) : isUser ? (
                    <p className="text-xs sm:text-[13.5px] leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </p>
                  ) : (
                    <FormattedMessageText text={msg.text} />
                  )}

                  <div
                    className={`mt-2 flex items-center justify-between gap-3 text-[11px] tabular-nums ${
                      isUser ? 'text-emerald-100/80' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <span>
                      {isUser ? 'Anda' : 'Asisten PKBM'} · {msg.createdAt}
                    </span>
                    {!isUser && msg.text && msg.id !== 'welcome-msg' && (
                      <button
                        type="button"
                        onClick={() => void handleCopyMessage(msg.id, msg.text)}
                        className="inline-flex items-center gap-1 text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Disalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isUser && (
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Error Banner with Shake */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            key="assistant-error"
            variants={ERROR_SHAKE_VARIANTS}
            initial="initial"
            animate="animate"
            exit="exit"
            role="alert"
            className="mb-3 px-3.5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
            {lastFailedPrompt && (
              <button
                type="button"
                onClick={() => void sendMessage(lastFailedPrompt)}
                className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold whitespace-nowrap shrink-0"
              >
                Coba Lagi
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Composer */}
      <form
        onSubmit={handleSubmit}
        className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2"
      >
        <input
          ref={isModalView ? undefined : resolvedInputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isStreaming}
          placeholder="Tanyakan jadwal pelajaran, kurikulum Paket A/B/C, atau administrasi..."
          aria-label="Ketik pertanyaan untuk Asisten Siswa AI"
          className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors disabled:opacity-60"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={handleStopStreaming}
            className="min-h-[44px] px-4 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Hentikan</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-emerald-700 to-amber-600 hover:from-emerald-800 hover:to-amber-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45 disabled:pointer-events-none transition-all shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>Kirim</span>
          </button>
        )}
      </form>

      {/* Subtle Functional Action Footer */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>Data tersinkronisasi dengan jadwal &amp; kurikulum SIAKAD aktif</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              onNavigate('assignments');
            }}
            className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Buka Jadwal
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              onNavigate('documents');
            }}
            className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
          >
            Cetak Surat A4
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <section
        id="dashboard-student-assistant"
        aria-label="Asisten Siswa AI"
        className="rounded-2xl border border-emerald-950/10 dark:border-white/10 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm"
      >
        {renderChatSurface(false)}
      </section>

      <MotionModal
        open={expanded}
        onClose={() => setExpanded(false)}
        maxWidthClass="max-w-3xl"
      >
        {renderChatSurface(true)}
      </MotionModal>
    </>
  );
};
