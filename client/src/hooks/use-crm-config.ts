import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { STATIC_STALE_TIME, getAuthHeaders } from "@/lib/queryClient";

  export interface CrmPipelineGroup {
    id: string;
    name: string;
    color: string;
    position: number;
  }

  export interface CrmRelationship {
    id: string;
    name: string;
    color: string;
    position?: string;
    groupId?: string | null;
    isParentGroup?: boolean;
    parentId?: string | null;
    isSystemDefault?: boolean;
    isUsed?: boolean;
  }

  export function useCrmPipelineGroups() {
    return useQuery<CrmPipelineGroup[]>({
      queryKey: [api.crm.pipelineGroups.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.pipelineGroups.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM pipeline groups");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
    });
  }

  export function useCrmRelationships() {
    return useQuery<CrmRelationship[]>({
      queryKey: [api.crm.relationships.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.relationships.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM relationships");
        return await res.json();
      },
      // Relationship filters are shown prominently in /customers. Always
      // revalidate on page mount so direct database maintenance is reflected.
      staleTime: 0,
      refetchOnMount: "always",
    });
  }

  export function useCrmCustomerSources(enabled = true) {
    return useQuery({
      queryKey: [api.crm.customerSources.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.customerSources.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM customer sources");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
      enabled,
    });
  }

  export function useCrmRejectReasons(enabled = true) {
    return useQuery({
      queryKey: [api.crm.rejectReasons.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.rejectReasons.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM reject reasons");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
      enabled,
    });
  }

  export interface CrmRequiredField { fieldKey: string; isRequired: boolean }

  export function useCrmRequiredFields() {
    return useQuery<CrmRequiredField[]>({
      queryKey: [api.crm.requiredFields.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.requiredFields.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM required fields");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
    });
  }

  export interface CrmRegistrationFormField { fieldKey: string; isVisible: boolean; isRequired: boolean }

  export function useCrmRegistrationFormFields() {
    return useQuery<CrmRegistrationFormField[]>({
      queryKey: [api.crm.registrationFields.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.registrationFields.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM registration form fields");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
    });
  }

  export interface CrmCustomField {
    id: string;
    label: string;
    fieldType: "text" | "number" | "date" | "textarea" | "select";
    options?: string[] | null;
    position: number;
    createdAt?: string;
    updatedAt?: string;
  }

  export function useCrmCustomFields() {
    return useQuery<CrmCustomField[]>({
      queryKey: [api.crm.customFields.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.customFields.list.path, { credentials: "include", headers: getAuthHeaders() });
        if (!res.ok) throw new Error("Failed to fetch CRM custom fields");
        return await res.json();
      },
      staleTime: STATIC_STALE_TIME,
    });
  }
  