import { z } from 'zod';
import { 
  insertLocationSchema, locations, 
  insertUserSchema, users,
  insertStaffSchema, staff,
  insertStudentSchema, students,
  insertDepartmentSchema, departments,
  insertRoleSchema, roles,
  insertCrmRelationshipSchema,
  insertCrmRejectReasonSchema,
  insertCrmCustomerSourceSchema,
  insertCrmCustomFieldSchema,
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string()
  })
};

const studentWithRelationsSchema = z.custom<typeof students.$inferSelect & {
  location?: typeof locations.$inferSelect,
  salesBy?: typeof staff.$inferSelect,
  managedBy?: typeof staff.$inferSelect,
  teacher?: typeof staff.$inferSelect
}>();

const departmentWithRolesSchema = z.custom<typeof departments.$inferSelect & {
  roles: typeof roles.$inferSelect[]
}>();

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: z.object({
        username: z.string(),
        password: z.string()
      }),
      responses: {
        200: z.object({
          user: z.custom<typeof users.$inferSelect>(),
          token: z.string().optional()
        }),
        401: errorSchemas.unauthorized
      }
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: z.object({ message: z.string() })
      }
    },
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized
      }
    }
  },
  locations: {
    list: {
      method: 'GET' as const,
      path: '/api/locations' as const,
      responses: {
        200: z.array(z.custom<typeof locations.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/locations' as const,
      input: insertLocationSchema,
      responses: {
        201: z.custom<typeof locations.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/locations/:id' as const,
      responses: {
        200: z.custom<typeof locations.$inferSelect>(),
        404: errorSchemas.notFound
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/locations/:id' as const,
      input: insertLocationSchema.partial(),
      responses: {
        200: z.custom<typeof locations.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/locations/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound
      }
    }
  },
  departments: {
    list: {
      method: 'GET' as const,
      path: '/api/departments' as const,
      responses: {
        200: z.array(departmentWithRolesSchema),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/departments' as const,
      input: insertDepartmentSchema,
      responses: {
        201: z.custom<typeof departments.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/departments/:id' as const,
      input: insertDepartmentSchema.partial(),
      responses: {
        200: z.custom<typeof departments.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/departments/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound
      }
    }
  },
  roles: {
    create: {
      method: 'POST' as const,
      path: '/api/roles' as const,
      input: insertRoleSchema,
      responses: {
        201: z.custom<typeof roles.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/roles/:id' as const,
      input: insertRoleSchema.partial(),
      responses: {
        200: z.custom<typeof roles.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/roles/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound
      }
    }
  },
  staff: {
    list: {
      method: 'GET' as const,
      path: '/api/staff' as const,
      input: z.object({ locationId: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof staff.$inferSelect>()),
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/staff' as const,
      input: z.object({
        fullName: z.string().min(1),
        code: z.string().min(1),
        username: z.string().min(1),
        password: z.string().min(6).optional(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        address: z.string().optional().nullable(),
        status: z.string().optional(),
        dateOfBirth: z.string().optional().nullable(),
        assignments: z.array(z.object({
          locationId: z.string().uuid(),
          departmentId: z.string().uuid().optional().nullable(),
          roleId: z.string().uuid().optional().nullable(),
        })).min(1, "Danh sách gán không được để trống"),
      }),
      responses: {
        201: z.custom<typeof staff.$inferSelect>(),
        400: errorSchemas.validation
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/staff/:id' as const,
      input: z.object({
        fullName: z.string().min(1).optional(),
        code: z.string().min(1).optional(),
        username: z.string().min(1).optional(),
        password: z.string().min(6).optional(),
        phone: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        address: z.string().optional().nullable(),
        status: z.string().optional(),
        dateOfBirth: z.string().optional().nullable(),
        assignments: z.array(z.object({
          locationId: z.string().uuid(),
          departmentId: z.string().uuid().optional().nullable(),
          roleId: z.string().uuid().optional().nullable(),
        })).optional(),
      }),
      responses: {
        200: z.custom<typeof staff.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/staff/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound
      }
    },
  },
  students: {
    list: {
      method: 'GET' as const,
      path: '/api/students' as const,
      input: z.object({ locationId: z.string().optional() }).optional(),
      responses: {
        200: z.array(studentWithRelationsSchema),
      }
    },
    removeFromSessions: {
      method: 'POST' as const,
      path: '/api/students/remove-from-sessions' as const,
      input: z.object({
        studentIds: z.array(z.string().uuid()).min(1),
        studentClassId: z.string().uuid(),
        fromSessionOrder: z.number().int().min(1),
        toSessionOrder: z.number().int().min(1),
        deleteMode: z.enum(['single', 'range']),
      }),
      responses: {
        200: z.object({ 
          success: z.boolean(),
          hasAttendedSessions: z.boolean().optional(),
        }),
        400: errorSchemas.validation,
      }
    },
    removeFromSessionsConfirm: {
      method: 'POST' as const,
      path: '/api/students/remove-from-sessions-confirm' as const,
      input: z.object({
        studentIds: z.array(z.string().uuid()).min(1),
        studentClassId: z.string().uuid(),
        fromSessionOrder: z.number().int().min(1),
        toSessionOrder: z.number().int().min(1),
        deleteMode: z.enum(['single', 'range']),
        deleteOnlyUnattended: z.boolean(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      }
    },
    transferClass: {
      method: 'POST' as const,
      path: '/api/students/transfer-class' as const,
      input: z.object({
        studentId: z.string().uuid(),
        fromClassId: z.string().uuid(),
        toClassId: z.string().uuid(),
        fromSessionIndex: z.number().int().min(1),
        toSessionIndex: z.number().int().min(1),
        transferCount: z.number().int().min(1),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      }
    },
    get: {
      method: 'GET' as const,
      path: '/api/students/:id' as const,
      responses: {
        200: studentWithRelationsSchema,
        404: errorSchemas.notFound
      }
    },
    create: {
      method: 'POST' as const,
      path: '/api/students' as const,
      input: z.object({
        fullName: z.string().min(1),
        type: z.enum(["Học viên", "Phụ huynh"]),
        code: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        locationIds: z.array(z.string().uuid()).min(1, "Vui lòng chọn ít nhất một cơ sở"),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional().nullable(),
        gender: z.string().optional(),
        email: z.string().email().optional().nullable().or(z.literal("")),
        parentName: z.string().optional(),
        parentPhone: z.string().optional(),
        parentName2: z.string().optional(),
        parentPhone2: z.string().optional(),
        parentName3: z.string().optional(),
        parentPhone3: z.string().optional(),
        address: z.string().optional(),
        source: z.string().optional(),
        pipelineStage: z.array(z.string()).optional(),
        relationshipIds: z.array(z.string()).optional(),
        customerSourceIds: z.array(z.string()).optional(),
        classId: z.string().optional(),
        rejectReason: z.string().optional(),
        socialLink: z.string().optional(),
        academicLevel: z.string().optional(),
        school: z.string().optional(),
        note: z.string().optional(),
        salesByIds: z.array(z.string()).optional(),
        managedByIds: z.array(z.string()).optional(),
        teacherIds: z.array(z.string()).optional(),
        parentIds: z.array(z.string()).optional(),
        avatarUrl: z.string().optional(),
        customFields: z.record(z.any()).optional(),
      }).refine(data => {
        const uniqueIds = new Set(data.locationIds);
        return uniqueIds.size === data.locationIds.length;
      }, { message: "Cơ sở không được trùng lặp" }),
      responses: {
        201: studentWithRelationsSchema,
        400: errorSchemas.validation
      }
    },
    update: {
      method: 'PUT' as const,
      path: '/api/students/:id' as const,
      input: z.object({
        fullName: z.string().min(1).optional(),
        type: z.enum(["Học viên", "Phụ huynh"]).optional(),
        locationIds: z.array(z.string().uuid()).optional(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional().nullable(),
        gender: z.string().optional(),
        email: z.string().email().optional().nullable().or(z.literal("")),
        parentName: z.string().optional(),
        parentPhone: z.string().optional(),
        parentName2: z.string().optional(),
        parentPhone2: z.string().optional(),
        parentName3: z.string().optional(),
        parentPhone3: z.string().optional(),
        address: z.string().optional(),
        source: z.string().optional(),
        pipelineStage: z.array(z.string()).optional(),
        relationshipIds: z.array(z.string()).optional(),
        customerSourceIds: z.array(z.string()).optional(),
        classId: z.string().optional(),
        rejectReason: z.string().optional(),
        socialLink: z.string().optional(),
        academicLevel: z.string().optional(),
        school: z.string().optional(),
        note: z.string().optional(),
        salesByIds: z.array(z.string()).optional(),
        managedByIds: z.array(z.string()).optional(),
        teacherIds: z.array(z.string()).optional(),
        parentIds: z.array(z.string()).optional(),
        accountStatus: z.string().optional(),
        password: z.string().optional(),
        avatarUrl: z.string().optional(),
        customFields: z.record(z.any()).optional(),
      }).partial(),
      responses: {
        200: studentWithRelationsSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound
      }
    },
    delete: { path: "/api/students/:id", method: "DELETE" },
    importClassAssign: { path: "/api/students/import-class-assign", method: "POST" },
  },
  crm: {
    relationships: {
      list: { path: "/api/crm/relationships", method: "GET" },
      create: { path: "/api/crm/relationships", method: "POST", input: insertCrmRelationshipSchema },
      update: { path: "/api/crm/relationships/:id", method: "PUT", input: insertCrmRelationshipSchema.partial() },
      delete: { path: "/api/crm/relationships/:id", method: "DELETE" },
    },
    rejectReasons: {
      list: { path: "/api/crm/reject-reasons", method: "GET" },
      create: { path: "/api/crm/reject-reasons", method: "POST", input: insertCrmRejectReasonSchema },
      update: { path: "/api/crm/reject-reasons/:id", method: "PUT", input: insertCrmRejectReasonSchema.partial() },
      delete: { path: "/api/crm/reject-reasons/:id", method: "DELETE" },
    },
    customerSources: {
      list: { path: "/api/crm/customer-sources", method: "get" },
      create: { path: "/api/crm/customer-sources", method: "post", input: insertCrmCustomerSourceSchema },
      update: { path: "/api/crm/customer-sources/:id", method: "put", input: insertCrmCustomerSourceSchema.partial() },
      delete: { path: "/api/crm/customer-sources/:id", method: "delete" },
    },
    requiredFields: {
      list: { path: "/api/crm/required-fields", method: "GET" },
      upsert: { path: "/api/crm/required-fields", method: "PUT" },
    },
    customFields: {
      list: { path: "/api/crm/custom-fields", method: "GET" },
      create: { path: "/api/crm/custom-fields", method: "POST", input: insertCrmCustomFieldSchema },
      update: { path: "/api/crm/custom-fields/:id", method: "PUT", input: insertCrmCustomFieldSchema.partial() },
      delete: { path: "/api/crm/custom-fields/:id", method: "DELETE" },
    },
  },
  courses: {
    list: { path: "/api/courses", method: "get" },
    create: { path: "/api/courses", method: "post" },
    feePackages: { path: "/api/courses/:id/fee-packages", method: "get" },
    createFeePackage: { path: "/api/courses/:id/fee-packages", method: "post" },
  },
  studentComments: {
    list: { path: "/api/students/:id/comments", method: "GET" },
    create: { path: "/api/students/:id/comments", method: "POST" },
  },
  studentClasses: {
    list: { path: "/api/students/:id/classes", method: "GET" },
    studentClassList: { path: "/api/student-classes", method: "GET" },
    endingSoon: { path: "/api/student-classes/ending-soon", method: "GET" },
  },
  classes: {
    list: { path: "/api/classes", method: "GET" },
    create: { path: "/api/classes", method: "POST" },
    get: { path: "/api/classes/:id", method: "GET" },
    update: { path: "/api/classes/:id", method: "PATCH" },
    delete: { path: "/api/classes/:id", method: "DELETE" },
    bulkDelete: { path: "/api/classes/bulk", method: "DELETE" },
    assignInfo: { path: "/api/classes/:id/assign-info", method: "GET" },
    waitingStudents: { path: "/api/classes/:id/waiting-students", method: "GET" },
    activeStudents: { path: "/api/classes/:id/active-students", method: "GET" },
    availableStudents: { path: "/api/classes/:id/available-students", method: "GET" },
    addStudents: { path: "/api/classes/:id/add-students", method: "POST" },
    scheduleStudents: { path: "/api/classes/:id/schedule-students", method: "POST" },
    sessions: { path: "/api/classes/:id/sessions", method: "GET" },
    studentSessions: { path: "/api/classes/:id/student/:studentId/sessions", method: "GET" },
    changeTeacher: { path: "/api/classes/:id/change-teacher", method: "POST" },
    checkAttendanceBeforeDelete: { path: "/api/classes/check-attendance-before-delete", method: "POST" },
    deleteSessions: { path: "/api/classes/delete-sessions", method: "POST" },
    updateCycle: { path: "/api/classes/:id/update-cycle", method: "POST" },
    cancelSessions: { path: "/api/classes/:id/cancel-sessions", method: "POST" },
    checkAttendanceForExclusion: { path: "/api/classes/check-attendance-for-exclusion", method: "POST" },
    excludeSessions: { path: "/api/classes/exclude-sessions", method: "POST" },
    exclusions: { path: "/api/classes/:id/exclusions", method: "GET" },
    extendStudents: { path: "/api/classes/:id/extend-students", method: "POST" },
    makeup: { path: "/api/classes/:id/makeup", method: "POST" },
    endingSoon: { path: "/api/classes/ending-soon", method: "GET" },
  },
  classSessions: {
    studentSessions: { path: "/api/class-sessions/:id/student-sessions", method: "GET" },
    students: { path: "/api/class-sessions/:id/students", method: "GET" },
    update: { path: "/api/class-sessions/:id", method: "PATCH" },
    contents: { path: "/api/class-sessions/:classSessionId/contents", method: "GET" },
    createContent: { path: "/api/class-sessions/:classSessionId/contents", method: "POST" },
    deleteContent: { path: "/api/class-sessions/:classSessionId/contents", method: "DELETE" },
    deleteOneContent: { path: "/api/class-sessions/:classSessionId/contents/:contentId", method: "DELETE" },
    createStudentContent: { path: "/api/class-sessions/:classSessionId/student-contents", method: "POST" },
  },
  studentSessions: {
    updateAttendance: { path: "/api/student-sessions/:id/attendance", method: "PATCH" },
    attendance: { path: "/api/student-sessions/attendance", method: "POST" },
    bulkAttendance: { path: "/api/student-sessions/bulk-attendance", method: "POST" },
    tuitionPackage: { path: "/api/student-sessions/tuition-package", method: "POST" },
    review: { path: "/api/student-sessions/review", method: "POST" },
  },
  attendance: {
    list: { path: "/api/attendance", method: "GET" },
  },
  dashboard: {
    stats: {
      method: 'GET' as const,
      path: '/api/dashboard/stats' as const,
      responses: {
        200: z.object({
          totalStudents: z.number(),
          totalStaff: z.number(),
          totalLocations: z.number()
        })
      }
    }
  },
  questions: {
    list:   { path: "/api/questions",     method: "GET" },
    get:    { path: "/api/questions/:id", method: "GET" },
    create: { path: "/api/questions",     method: "POST" },
    update: { path: "/api/questions/:id", method: "PUT" },
    delete: { path: "/api/questions/:id", method: "DELETE" },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
