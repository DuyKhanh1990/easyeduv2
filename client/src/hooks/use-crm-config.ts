import { useQuery } from "@tanstack/react-query";
  import { api } from "@shared/routes";

  export interface CrmRelationship {
    id: string;
    name: string;
    color: string;
    position?: string;
  }

  export function useCrmRelationships() {
    return useQuery<CrmRelationship[]>({
      queryKey: [api.crm.relationships.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.relationships.list.path, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch CRM relationships");
        return await res.json();
      },
    });
  }

  export function useCrmCustomerSources() {
    return useQuery({
      queryKey: [api.crm.customerSources.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.customerSources.list.path, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch CRM customer sources");
        return await res.json();
      },
    });
  }

  export function useCrmRejectReasons() {
    return useQuery({
      queryKey: [api.crm.rejectReasons.list.path],
      queryFn: async () => {
        const res = await fetch(api.crm.rejectReasons.list.path, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch CRM reject reasons");
        return await res.json();
      },
    });
  }
  