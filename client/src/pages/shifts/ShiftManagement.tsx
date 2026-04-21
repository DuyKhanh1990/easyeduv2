import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search, Trash2, Edit2, Calendar } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeacherAvailabilitySchema } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";

const weekdays = [
  { id: 1, label: "Thứ 2" },
  { id: 2, label: "Thứ 3" },
  { id: 3, label: "Thứ 4" },
  { id: 4, label: "Thứ 5" },
  { id: 5, label: "Thứ 6" },
  { id: 6, label: "Thứ 7" },
  { id: 0, label: "Chủ Nhật" },
];

const formSchema = z.object({
  locationId: z.string().min(1, "Vui lòng chọn cơ sở"),
  teacherId: z.string().min(1, "Vui lòng chọn giáo viên"),
  shiftTemplateId: z.string().min(1, "Vui lòng chọn ca"),
  weekdays: z.array(z.number()).min(1, "Vui lòng chọn ít nhất một thứ"),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});

export function ShiftManagement() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    locationId: "all",
    teacherId: "all",
    weekday: "all",
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/locations"],
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["/api/staff", filters.locationId !== "all" ? filters.locationId : undefined],
    enabled: true,
  });

  const teachers = staff.filter((s: any) => 
    s.assignments?.some((a: any) => a.role?.name?.toLowerCase().includes("giáo viên") || a.role?.name?.toLowerCase().includes("teacher"))
  );

  const { data: shiftTemplates = [] } = useQuery({
    queryKey: ["/api/shift-templates", filters.locationId !== "all" ? filters.locationId : undefined],
  });

  const { data: availabilities = [], isLoading } = useQuery({
    queryKey: ["/api/teacher-availability", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.locationId !== "all") params.append("locationId", filters.locationId);
      if (filters.teacherId !== "all") params.append("teacherId", filters.teacherId);
      if (filters.weekday !== "all") params.append("weekday", filters.weekday);
      const res = await fetch(`/api/teacher-availability?${params.toString()}`);
      return res.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await apiRequest("POST", "/api/teacher-availability", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher-availability"] });
      toast({ title: "Thành công", description: "Đã đăng ký ca dạy mới" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ 
        title: "Lỗi", 
        description: error.message || "Không thể đăng ký ca dạy",
        variant: "destructive" 
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teacher-availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher-availability"] });
      toast({ title: "Thành công", description: "Đã xoá đăng ký" });
    }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      locationId: "",
      teacherId: "",
      shiftTemplateId: "",
      weekdays: [],
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const selectedLocationId = form.watch("locationId");
  const filteredTeachersForForm = staff.filter((s: any) => 
    s.assignments?.some((a: any) => a.locationId === selectedLocationId)
  );
  const filteredShiftsForForm = shiftTemplates.filter((s: any) => s.locationId === selectedLocationId);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Quản lý Ca làm việc</h1>
            <p className="text-muted-foreground mt-1">Quản lý đăng ký ca dạy và lịch làm việc của nhân sự</p>
          </div>
        </div>

        <Tabs defaultValue="register" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <button
              className={cn(
                "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                "bg-primary border-primary text-primary-foreground"
              )}
            >
              Đăng ký ca dạy
            </button>
          </div>

          <TabsContent value="register">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Select value={filters.locationId} onValueChange={(v) => setFilters(f => ({ ...f, locationId: v }))}>
                <SelectTrigger><SelectValue placeholder="Cơ sở" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.teacherId} onValueChange={(v) => setFilters(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger><SelectValue placeholder="Giáo viên" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả giáo viên</SelectItem>
                  {teachers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.weekday} onValueChange={(v) => setFilters(f => ({ ...f, weekday: v }))}>
                <SelectTrigger><SelectValue placeholder="Thứ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả các thứ</SelectItem>
                  {weekdays.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Đăng ký mới
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Đăng ký ca rảnh giáo viên</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="locationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="teacherId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Giáo viên</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedLocationId}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn giáo viên" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {filteredTeachersForForm.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="shiftTemplateId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ca học</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedLocationId}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn ca" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {filteredShiftsForForm.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="weekdays"
                        render={() => (
                          <FormItem>
                            <FormLabel>Thứ trong tuần</FormLabel>
                            <div className="grid grid-cols-4 gap-2">
                              {weekdays.map((w) => (
                                <FormField
                                  key={w.id}
                                  control={form.control}
                                  name="weekdays"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(w.id)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, w.id])
                                              : field.onChange(field.value?.filter((value) => value !== w.id));
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-xs font-normal cursor-pointer">{w.label}</FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="effectiveFrom"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Từ ngày</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="effectiveTo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Đến ngày</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <DialogFooter>
                        <Button type="submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Đang lưu..." : "Lưu đăng ký"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Giáo viên</TableHead>
                      <TableHead>Cơ sở</TableHead>
                      <TableHead>Thứ</TableHead>
                      <TableHead>Ca</TableHead>
                      <TableHead>Hiệu lực</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8">Đang tải...</TableCell></TableRow>
                    ) : !Array.isArray(availabilities) || availabilities.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Không tìm thấy đăng ký nào.</TableCell></TableRow>
                    ) : (
                      availabilities.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.teacher?.fullName}</TableCell>
                          <TableCell>{item.location?.name}</TableCell>
                          <TableCell>{weekdays.find(w => w.id === item.weekday)?.label}</TableCell>
                          <TableCell>
                            <div>{item.shiftTemplate?.name}</div>
                            <div className="text-xs text-muted-foreground">{item.shiftTemplate?.startTime} - {item.shiftTemplate?.endTime}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              {item.effectiveFrom ? format(new Date(item.effectiveFrom), "dd/MM/yyyy") : "---"} 
                              {" → "}
                              {item.effectiveTo ? format(new Date(item.effectiveTo), "dd/MM/yyyy") : "Không thời hạn"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                if (confirm("Bạn có chắc chắn muốn xoá đăng ký này?")) {
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
