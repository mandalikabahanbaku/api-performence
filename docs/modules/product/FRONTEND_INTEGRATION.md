# 📦 Product Module — Frontend Integration Guide

---

## 1. Zod Schema (`product.schema.ts`)

```ts
import { z } from "zod";
import { GENDER, STATUS } from "@/shared/types";

export const RequestProductSchema = z.object({
    code: z.string().max(100).regex(/^\S+$/, { message: "Gunakan '_' untuk spasi" }),
    name: z.string().min(5, "Min. 5 karakter").max(100),
    size: z.coerce.number().int().min(2),
    gender: z.enum(GENDER).default("UNISEX").optional(),
    status: z.enum(STATUS).default("PENDING").optional(),
    z_value: z.number().default(1.65),
    lead_time: z.number().int().min(1).default(14),
    review_period: z.number().int().min(1).default(30),
    unit: z.string().nullable().optional(),
    product_type: z.string().nullable().optional(),
    distribution_percentage: z.coerce.number().min(0).default(0).optional(),
    safety_percentage: z.coerce.number().min(0).default(0).optional(),
});

export const QueryProductSchema = z.object({
    search: z.string().optional(),
    status: z.enum(STATUS).optional(),
    gender: z.enum(GENDER).optional(),
    type_id: z.number().optional(),
    page: z.number().default(1),
    take: z.number().default(25),
    sortBy: z.string().default("name"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type RequestProductDTO = z.infer<typeof RequestProductSchema>;
export type QueryProductDTO = z.infer<typeof QueryProductSchema>;

export type ProductSizeDTO = { id: number; size: number };
export type ProductUnitDTO = { id: number; name: string; slug: string };
export type ProductTypeDTO = { id: number; name: string; slug: string };

export type ResponseProductDTO = RequestProductDTO & {
    id: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    product_type: ProductTypeDTO | null;
    unit: ProductUnitDTO | null;
    size: ProductSizeDTO | null;
};
```

---

## 2. Service (`product.service.ts`)

```ts
import api from "@/lib/api";
import { setupCSRFToken } from "@/lib/api";
import type { RequestProductDTO, QueryProductDTO, ResponseProductDTO } from "./product.schema";
import type { ApiSuccessResponse } from "@/shared/types";

type ListResponse = { data: ResponseProductDTO[]; len: number };

export class ProductService {
    static async list(query: Partial<QueryProductDTO>) {
        const { data } = await api.get<ApiSuccessResponse<ListResponse>>(
            "/api/app/products",
            { params: query }
        );
        return data.data;
    }

    static async detail(id: number) {
        const { data } = await api.get<ApiSuccessResponse<ResponseProductDTO>>(
            `/api/app/products/${id}`
        );
        return data.data;
    }

    static async create(body: RequestProductDTO) {
        await setupCSRFToken();
        const { data } = await api.post<ApiSuccessResponse<ResponseProductDTO>>(
            "/api/app/products",
            body
        );
        return data.data;
    }

    static async update(id: number, body: Partial<RequestProductDTO>) {
        await setupCSRFToken();
        const { data } = await api.put<ApiSuccessResponse<ResponseProductDTO>>(
            `/api/app/products/${id}`,
            body
        );
        return data.data;
    }

    static async changeStatus(id: number, status: string) {
        await setupCSRFToken();
        await api.patch(`/api/app/products/status/${id}`, null, { params: { status } });
    }

    static async clean() {
        await setupCSRFToken();
        await api.delete("/api/app/products/clean");
    }
}

// ─── Size Service ───────────────────────────────────────────────────────────

export class ProductSizeService {
    static async list(params?: { search?: number; page?: number; take?: number }) {
        const { data } = await api.get<ApiSuccessResponse<{ data: ProductSizeDTO[]; len: number }>>(
            "/api/app/products/sizes",
            { params }
        );
        return data.data;
    }

    static async create(size: number) {
        await setupCSRFToken();
        const { data } = await api.post<ApiSuccessResponse<ProductSizeDTO>>(
            "/api/app/products/sizes",
            { size }
        );
        return data.data;
    }

    static async update(id: number, size: number) {
        await setupCSRFToken();
        await api.put(`/api/app/products/sizes/${id}`, { size });
    }

    static async delete(id: number) {
        await setupCSRFToken();
        await api.delete(`/api/app/products/sizes/${id}`);
    }
}

// ─── Unit Service ───────────────────────────────────────────────────────────

export class ProductUnitService {
    static async list(params?: { search?: string; page?: number; take?: number }) {
        const { data } = await api.get<ApiSuccessResponse<{ data: ProductUnitDTO[]; len: number }>>(
            "/api/app/products/units",
            { params }
        );
        return data.data;
    }

    static async create(name: string) {
        await setupCSRFToken();
        const { data } = await api.post<ApiSuccessResponse<ProductUnitDTO>>(
            "/api/app/products/units",
            { name }
        );
        return data.data;
    }

    static async update(id: number, name: string) {
        await setupCSRFToken();
        await api.put(`/api/app/products/units/${id}`, { name });
    }

    static async delete(id: number) {
        await setupCSRFToken();
        await api.delete(`/api/app/products/units/${id}`);
    }
}

// ─── Type Service ───────────────────────────────────────────────────────────

export class ProductTypeService {
    // Sama persis dengan ProductUnitService, endpoint: /api/app/products/types
}
```

---

## 3. React Query Hooks (`use.product.ts`)

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { notificationAtom } from "@/shared/store";
import { ProductService } from "./product.service";
import type { QueryProductDTO, RequestProductDTO } from "./product.schema";

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const productKeys = {
    all: ["products"] as const,
    list: (query: Partial<QueryProductDTO>) => ["products", "list", query] as const,
    detail: (id: number) => ["products", "detail", id] as const,
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export function useProducts(query: Partial<QueryProductDTO> = {}) {
    return useQuery({
        queryKey: productKeys.list(query),
        queryFn: () => ProductService.list(query),
        staleTime: 2 * 60 * 1000,
    });
}

export function useProduct(id: number) {
    return useQuery({
        queryKey: productKeys.detail(id),
        queryFn: () => ProductService.detail(id),
        enabled: !!id,
    });
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function useActionProduct() {
    const qc = useQueryClient();
    const setNotif = useSetAtom(notificationAtom);

    const invalidate = () => qc.invalidateQueries({ queryKey: productKeys.all });

    const create = useMutation({
        mutationFn: (body: RequestProductDTO) => ProductService.create(body),
        onSuccess: () => {
            invalidate();
            setNotif({ type: "success", message: "Produk berhasil dibuat" });
        },
    });

    const update = useMutation({
        mutationFn: ({ id, body }: { id: number; body: Partial<RequestProductDTO> }) =>
            ProductService.update(id, body),
        onSuccess: () => {
            invalidate();
            setNotif({ type: "success", message: "Produk berhasil diperbarui" });
        },
    });

    const changeStatus = useMutation({
        mutationFn: ({ id, status }: { id: number; status: string }) =>
            ProductService.changeStatus(id, status),
        onSuccess: () => invalidate(),
    });

    const clean = useMutation({
        mutationFn: () => ProductService.clean(),
        onSuccess: () => {
            invalidate();
            setNotif({ type: "success", message: "Produk dihapus permanen" });
        },
    });

    return {
        create: create.mutateAsync,
        update: update.mutateAsync,
        changeStatus: changeStatus.mutateAsync,
        clean: clean.mutateAsync,
        isPending: create.isPending || update.isPending || changeStatus.isPending || clean.isPending,
    };
}
```

---

## 4. Pola Penggunaan di UI

### List Page

```tsx
export default function ProductsPage() {
    const [query, setQuery] = useState<Partial<QueryProductDTO>>({ page: 1, take: 25 });
    const { data, isLoading } = useProducts(query);

    return (
        <DataTable
            data={data?.data ?? []}
            total={data?.len ?? 0}
            isLoading={isLoading}
            onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
            onSearch={(search) => setQuery((q) => ({ ...q, search, page: 1 }))}
        />
    );
}
```

### Form Create / Edit

```tsx
const { create, update, isPending } = useActionProduct();
const form = useForm<RequestProductDTO>({ resolver: zodResolver(RequestProductSchema) });

const onSubmit = async (data: RequestProductDTO) => {
    if (productId) {
        await update({ id: productId, body: data });
    } else {
        await create(data);
    }
};
```

### Change Status (misalnya tombol Aktifkan)

```tsx
const { changeStatus } = useActionProduct();

<Button onClick={() => changeStatus({ id: product.id, status: "ACTIVE" })}>
    Aktifkan
</Button>
```

---

## 5. Notes Penting

- **`unit` dan `product_type` dikirim sebagai string nama** (bukan ID). Backend akan find-or-create otomatis.
- **`size` dikirim sebagai number integer** — backend akan find-or-create di `product_size`.
- **Decimal fields** (`z_value`, `distribution_percentage`, `safety_percentage`) diterima sebagai `number` dari API.
- **`len`** di response list adalah total count sebelum pagination — gunakan ini untuk menghitung total halaman.
- Saat `status=DELETE`, produk tidak benar-benar dihapus — hanya `deleted_at` yang di-set. Hapus permanen via `clean()`.
