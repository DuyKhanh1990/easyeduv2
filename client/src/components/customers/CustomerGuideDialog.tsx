import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import {
  BookOpen,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  CustomerGuide,
  CustomerGuideGroup,
  CustomerGuideSection,
} from "@shared/customer-guide";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RichEditor } from "@/components/ui/rich-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GUIDE_QUERY_KEY = ["/api/customer-guide"];

export type GuideDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryKey?: string[];
  saveEndpoint?: string;
  savePayload?: (guide: CustomerGuide) => unknown;
};

function cloneGuide(guide: CustomerGuide): CustomerGuide {
  return JSON.parse(JSON.stringify(guide)) as CustomerGuide;
}

function safeHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe", "video", "audio", "source"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "target", "rel", "controls", "src", "style"],
  });
}

function plainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|blockquote)>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function updateGroup(
  guide: CustomerGuide,
  groupId: string,
  updater: (group: CustomerGuideGroup) => CustomerGuideGroup,
) {
  return {
    ...guide,
    groups: guide.groups.map((group) => (group.id === groupId ? updater(group) : group)),
  };
}

function updateSection(
  guide: CustomerGuide,
  groupId: string,
  sectionId: string,
  updater: (section: CustomerGuideSection) => CustomerGuideSection,
) {
  return updateGroup(guide, groupId, (group) => ({
    ...group,
    sections: group.sections.map((section) =>
      section.id === sectionId ? updater(section) : section,
    ),
  }));
}

export function GuideDocumentDialog({
  open,
  onOpenChange,
  queryKey = GUIDE_QUERY_KEY,
  saveEndpoint = "/api/customer-guide",
  savePayload,
}: GuideDocumentDialogProps) {
  const { data: myPerms } = useMyPermissions();
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CustomerGuide | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [draggedSection, setDraggedSection] = useState<{ groupId: string; sectionId: string } | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const guideQuery = useQuery<CustomerGuide & { canEdit?: boolean }>({
    queryKey,
    enabled: open,
    staleTime: 60_000,
  });
  const guide = guideQuery.data;
  const currentGuide = isEditing ? draft : guide;
  const canEditGuide = Boolean(isSuperAdmin && guide?.canEdit);

  useEffect(() => {
    if (!open || !guide) return;
    setDraft(cloneGuide(guide));
    setActiveSectionId((current) => {
      const stillExists = guide.groups.some((group) =>
        group.sections.some((section) => section.id === current),
      );
      return stillExists ? current : (guide.groups[0]?.sections[0]?.id ?? "");
    });
    setExpandedGroups((current) => {
      const next = { ...current };
      guide.groups.forEach((group) => {
        if (next[group.id] === undefined) next[group.id] = true;
      });
      return next;
    });
  }, [open, guide]);

  const active = useMemo(() => {
    if (!currentGuide) return null;
    for (const group of currentGuide.groups) {
      const section = group.sections.find((item) => item.id === activeSectionId);
      if (section) return { group, section };
    }
    const fallbackGroup = currentGuide.groups[0];
    return fallbackGroup?.sections[0]
      ? { group: fallbackGroup, section: fallbackGroup.sections[0] }
      : null;
  }, [activeSectionId, currentGuide]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("vi");
    if (!query || !currentGuide) return [];

    return currentGuide.groups.flatMap((group) =>
      group.sections
        .filter((section) => {
          const searchable = [
            group.title,
            section.title,
            plainText(section.content),
          ]
            .join(" ")
            .toLocaleLowerCase("vi");
          return searchable.includes(query);
        })
        .map((section) => {
          const content = plainText(section.content);
          const searchable = `${section.title} — ${content}`;
          const matchIndex = searchable.toLocaleLowerCase("vi").indexOf(query);
          const start = Math.max(0, matchIndex - 45);
          const end = Math.min(searchable.length, start + 145);
          const snippet = `${start > 0 ? "…" : ""}${searchable.slice(start, end)}${end < searchable.length ? "…" : ""}`;

          return {
            groupId: group.id,
            groupTitle: group.title,
            sectionId: section.id,
            sectionTitle: section.title,
            snippet,
          };
        }),
    ).slice(0, 20);
  }, [currentGuide, searchQuery]);

  const jumpToSearchResult = (result: (typeof searchResults)[number]) => {
    setActiveSectionId(result.sectionId);
    setExpandedGroups((current) => ({ ...current, [result.groupId]: true }));
    setIsSearchOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("guide-document-content")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (value: CustomerGuide) => {
      const response = await apiRequest(
        "PUT",
        saveEndpoint,
        savePayload ? savePayload(value) : value,
      );
      return (await response.json()) as CustomerGuide;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
      setDraft(cloneGuide(saved));
      setIsEditing(false);
      toast({ title: "Đã lưu tài liệu", description: "Nội dung hướng dẫn đã được cập nhật." });
    },
    onError: (error: Error) => {
      toast({ title: "Không thể lưu tài liệu", description: error.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (!canEditGuide || !guide) return;
    setDraft(cloneGuide(guide));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (guide) setDraft(cloneGuide(guide));
    setIsEditing(false);
  };

  const addSection = (groupId: string) => {
    const id = `section-${Date.now()}`;
    setDraft((current) => {
      if (!current) return current;
      const next = updateGroup(current, groupId, (group) => ({
        ...group,
        sections: [
          ...group.sections,
          { id, title: "Mục mới", content: "<p>Bắt đầu viết nội dung...</p>" },
        ],
      }));
      return next;
    });
    setActiveSectionId(id);
  };

  const addGroup = () => {
    const id = `group-${Date.now()}`;
    const sectionId = `section-${Date.now()}-first`;
    setDraft((current) =>
      current
        ? {
            ...current,
            groups: [
              ...current.groups,
              {
                id,
                title: "Nhóm mục mới",
                sections: [{ id: sectionId, title: "Mục mới", content: "<p>Bắt đầu viết nội dung...</p>" }],
              },
            ],
          }
        : current,
    );
    setExpandedGroups((current) => ({ ...current, [id]: true }));
    setActiveSectionId(sectionId);
  };

  const removeSection = (groupId: string, sectionId: string) => {
    setDraft((current) => {
      if (!current) return current;
      const group = current.groups.find((item) => item.id === groupId);
      if (!group || group.sections.length <= 1) return current;
      const next = updateGroup(current, groupId, (item) => ({
        ...item,
        sections: item.sections.filter((section) => section.id !== sectionId),
      }));
      const replacement = group.sections.find((section) => section.id !== sectionId);
      if (replacement) setActiveSectionId(replacement.id);
      return next;
    });
  };

  const removeGroup = (groupId: string) => {
    setDraft((current) => {
      if (!current || current.groups.length <= 1) return current;
      const next = { ...current, groups: current.groups.filter((group) => group.id !== groupId) };
      const replacement = next.groups[0]?.sections[0];
      if (replacement) setActiveSectionId(replacement.id);
      return next;
    });
  };

  const clearDragState = () => {
    setDraggedGroupId(null);
    setDraggedSection(null);
    setDropTargetGroupId(null);
    setDropTargetSectionId(null);
  };

  const handleGroupDragStart = (event: DragEvent<HTMLSpanElement>, groupId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", groupId);
    setDraggedGroupId(groupId);
    setDraggedSection(null);
  };

  const handleGroupDrop = (event: DragEvent<HTMLDivElement>, targetGroupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedGroupId || draggedGroupId === targetGroupId) {
      clearDragState();
      return;
    }

    setDraft((current) => {
      if (!current) return current;
      const fromIndex = current.groups.findIndex((group) => group.id === draggedGroupId);
      const toIndex = current.groups.findIndex((group) => group.id === targetGroupId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const groups = [...current.groups];
      const [movedGroup] = groups.splice(fromIndex, 1);
      groups.splice(toIndex, 0, movedGroup);
      return { ...current, groups };
    });
    clearDragState();
  };

  const handleSectionDragStart = (event: DragEvent<HTMLSpanElement>, groupId: string, sectionId: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${groupId}:${sectionId}`);
    setDraggedSection({ groupId, sectionId });
    setDraggedGroupId(null);
  };

  const handleSectionDrop = (
    event: DragEvent<HTMLDivElement>,
    targetGroupId: string,
    targetSectionId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      !draggedSection ||
      draggedSection.groupId !== targetGroupId ||
      draggedSection.sectionId === targetSectionId
    ) {
      clearDragState();
      return;
    }

    setDraft((current) => {
      if (!current) return current;
      return updateGroup(current, targetGroupId, (group) => {
        const fromIndex = group.sections.findIndex((section) => section.id === draggedSection.sectionId);
        const toIndex = group.sections.findIndex((section) => section.id === targetSectionId);
        if (fromIndex < 0 || toIndex < 0) return group;
        const sections = [...group.sections];
        const [movedSection] = sections.splice(fromIndex, 1);
        sections.splice(toIndex, 0, movedSection);
        return { ...group, sections };
      });
    });
    clearDragState();
  };

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value && isEditing) cancelEditing();
      onOpenChange(value);
    }}>
      <DialogContent className="!inset-0 !left-0 !top-0 !flex !h-screen !max-h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-slate-200 bg-white p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-blue-50 px-6 py-4 text-left">
          <div className="flex flex-wrap items-start gap-3 pr-8">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              {isEditing && draft ? (
                <div className="space-y-2">
                  <Label htmlFor="guide-title" className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Tiêu đề tài liệu
                  </Label>
                  <Input
                    id="guide-title"
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    className="h-9 max-w-2xl bg-white text-lg font-bold"
                  />
                  <Input
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    placeholder="Mô tả ngắn cho tài liệu"
                    className="h-8 max-w-3xl text-sm"
                  />
                </div>
              ) : (
                <>
                  <DialogTitle className="text-xl font-bold text-slate-900">
                    {currentGuide?.title ?? "Tài liệu hướng dẫn — Học viên"}
                  </DialogTitle>
                  <DialogDescription className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {currentGuide?.description}
                  </DialogDescription>
                </>
              )}
            </div>
            <div className="relative order-3 w-full shrink-0 md:order-none md:w-[min(35vw,420px)]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setIsSearchOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setIsSearchOpen(false);
                  }}
                  placeholder="Tìm nhanh trong toàn bộ tài liệu..."
                  aria-label="Tìm kiếm trong toàn bộ tài liệu hướng dẫn"
                  className="h-10 border-slate-200 bg-white pl-9 pr-3 text-sm shadow-sm"
                />
              </div>
              {isSearchOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(60vh,420px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {searchResults.length > 0 ? (
                    <>
                      <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {searchResults.length} kết quả phù hợp
                      </p>
                      <div className="space-y-1">
                        {searchResults.map((result) => (
                          <button
                            key={`${result.groupId}:${result.sectionId}`}
                            type="button"
                            onClick={() => jumpToSearchResult(result)}
                            className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-sky-50"
                          >
                            <span className="block truncate text-xs font-semibold text-slate-800">
                              {result.sectionTitle}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-sky-700">
                              {result.groupTitle}
                            </span>
                            <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                              {result.snippet}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="px-3 py-4 text-center text-xs text-slate-500">
                      Không tìm thấy nội dung phù hợp.
                    </p>
                  )}
                </div>
              )}
            </div>
            {canEditGuide && !isEditing && (
              <Button type="button" variant="outline" size="sm" onClick={startEditing} className="shrink-0 gap-2 border-sky-200 text-sky-700 hover:bg-sky-50">
                <Pencil className="h-4 w-4" />
                Sửa
              </Button>
            )}
            {canEditGuide && isEditing && draft && (
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={cancelEditing} disabled={saveMutation.isPending} className="gap-2">
                  <X className="h-4 w-4" />
                  Hủy
                </Button>
                <Button type="button" size="sm" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending} className="gap-2 bg-sky-600 hover:bg-sky-700">
                  <Save className="h-4 w-4" />
                  {saveMutation.isPending ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {guideQuery.isLoading || !currentGuide ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Đang tải tài liệu...</div>
        ) : (
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[275px_minmax(0,1fr)]">
             <aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-2 flex items-center justify-between px-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Mục lục</p>
                {canEditGuide && isEditing && (
                  <button type="button" onClick={addGroup} className="rounded-md p-1 text-sky-600 hover:bg-sky-100" title="Thêm nhóm mục">
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
               {canEditGuide && isEditing && (
                 <p className="mb-3 px-2 text-[10px] leading-4 text-slate-500">
                   Kéo biểu tượng <GripVertical className="mx-0.5 inline h-3 w-3 align-[-2px]" /> để sắp xếp nhóm hoặc mục.
                 </p>
               )}
              <nav className="space-y-2">
                {currentGuide.groups.map((group) => {
                  const isExpanded = expandedGroups[group.id] ?? true;
                  return (
                     <div
                       key={group.id}
                       onDragOver={(event) => {
                         if (!draggedGroupId || draggedGroupId === group.id) return;
                         event.preventDefault();
                         event.dataTransfer.dropEffect = "move";
                         setDropTargetGroupId(group.id);
                       }}
                       onDrop={(event) => handleGroupDrop(event, group.id)}
                       className={`rounded-xl border bg-white/70 transition-colors ${
                         dropTargetGroupId === group.id
                           ? "border-sky-400 bg-sky-50/70"
                           : "border-slate-200/80"
                       }`}
                     >
                      <div className="flex items-center gap-1">
                         {canEditGuide && isEditing && (
                           <span
                             draggable
                             onDragStart={(event) => handleGroupDragStart(event, group.id)}
                             onDragEnd={clearDragState}
                             className="ml-1 cursor-grab rounded p-1 text-slate-300 hover:bg-sky-50 hover:text-sky-600 active:cursor-grabbing"
                             title="Kéo để sắp xếp nhóm"
                           >
                             <GripVertical className="h-4 w-4" />
                           </span>
                         )}
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !isExpanded }))}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-xs font-bold text-slate-700 transition-colors hover:bg-white hover:text-sky-700"
                          aria-expanded={isExpanded}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-sky-50 text-[10px] font-bold text-sky-700">
                            {group.sections[0]?.title.match(/^\d+/)?.[0] ?? "•"}
                          </span>
                        {canEditGuide && isEditing ? (
                            <Input
                              value={group.title}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setDraft((current) => current && updateGroup(current, group.id, (item) => ({ ...item, title: event.target.value })))}
                              className="h-7 min-w-0 flex-1 bg-white px-2 text-xs font-bold"
                            />
                          ) : (
                            <span className="flex-1 truncate">{group.title}</span>
                          )}
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90 text-sky-600" : ""}`} />
                        </button>
                        {canEditGuide && isEditing && (
                          <button type="button" onClick={() => removeGroup(group.id)} disabled={currentGuide.groups.length <= 1} className="mr-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Xóa nhóm">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div className="space-y-1 border-t border-slate-100 px-1.5 py-1.5">
                           {group.sections.map((section) => (
                             <div
                               key={section.id}
                               onDragOver={(event) => {
                                 if (
                                   !draggedSection ||
                                   draggedSection.groupId !== group.id ||
                                   draggedSection.sectionId === section.id
                                 ) return;
                                 event.preventDefault();
                                 event.stopPropagation();
                                 event.dataTransfer.dropEffect = "move";
                                 setDropTargetSectionId(`${group.id}:${section.id}`);
                               }}
                               onDrop={(event) => handleSectionDrop(event, group.id, section.id)}
                               className={`group/section flex items-center gap-1 rounded-lg ${
                                 dropTargetSectionId === `${group.id}:${section.id}` ? "bg-sky-50" : ""
                               }`}
                             >
                               {canEditGuide && isEditing && (
                                 <span
                                   draggable
                                   onDragStart={(event) => handleSectionDragStart(event, group.id, section.id)}
                                   onDragEnd={clearDragState}
                                   className="cursor-grab rounded p-0.5 text-slate-300 hover:bg-sky-50 hover:text-sky-600 active:cursor-grabbing"
                                   title="Kéo để sắp xếp mục"
                                 >
                                   <GripVertical className="h-3.5 w-3.5" />
                                 </span>
                               )}
                              <button
                                type="button"
                                onClick={() => setActiveSectionId(section.id)}
                                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-medium transition-colors ${activeSectionId === section.id ? "bg-sky-100 text-sky-800" : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"}`}
                              >
                                {canEditGuide && isEditing ? (
                                  <Input
                                    value={section.title}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(event) => setDraft((current) => current && updateSection(current, group.id, section.id, (item) => ({ ...item, title: event.target.value })))}
                                    className="h-7 min-w-0 flex-1 bg-white px-2 text-[11px]"
                                  />
                                ) : (
                                  <span className="flex-1">{section.title}</span>
                                )}
                                {!isEditing && <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" />}
                              </button>
                              {canEditGuide && isEditing && (
                                <button type="button" onClick={() => removeSection(group.id, section.id)} disabled={group.sections.length <= 1} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Xóa mục">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {canEditGuide && isEditing && (
                            <button type="button" onClick={() => addSection(group.id)} className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-sky-600 hover:bg-sky-50">
                              <Plus className="h-3.5 w-3.5" /> Thêm mục
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              {!isEditing && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <strong>Lưu ý:</strong> Các nút thao tác hiển thị tùy theo quyền của tài khoản.
                </div>
              )}
            </aside>

             <div id="guide-document-content" className="min-h-0 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
              {active && (
                <div className="mx-auto max-w-3xl">
                  {canEditGuide && isEditing ? (
                    <>
                      <div className="mb-4">
                        <Label className="mb-2 block text-xs font-semibold text-slate-600">Nội dung mục “{active.section.title}”</Label>
                        <RichEditor
                          value={active.section.content}
                          onChange={(value) => setDraft((current) => current && updateSection(current, active.group.id, active.section.id, (section) => ({ ...section, content: value })))}
                          minHeight="360px"
                          maxHeight="calc(92vh - 250px)"
                          placeholder="Viết nội dung hướng dẫn..."
                        />
                        <p className="mt-2 text-xs text-slate-500">
                          Có thể dán ảnh trực tiếp vào vị trí con trỏ, chèn link, upload ảnh/video/audio hoặc nhúng video YouTube.
                        </p>
                      </div>
                    </>
                  ) : (
                    <section className="guide-rich-content border-b border-slate-200 pb-7">
                      <h3 className="mb-4 text-lg font-bold tracking-tight text-slate-900">
                        {active.section.title}
                      </h3>
                      <div
                        className="prose prose-sm max-w-none leading-6 text-slate-600 [&_blockquote]:my-4 [&_blockquote]:rounded-xl [&_blockquote]:border-sky-200 [&_blockquote]:bg-sky-50 [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:not-italic [&_blockquote_p]:m-0 [&_h4]:mt-5 [&_h4]:font-semibold [&_h4]:text-slate-800 [&_img]:max-w-full [&_img]:rounded-lg [&_a]:font-medium [&_a]:text-sky-700 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: safeHtml(active.section.content) }}
                      />
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CustomerGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <GuideDocumentDialog open={open} onOpenChange={onOpenChange} />;
}