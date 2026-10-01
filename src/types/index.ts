export type PageProps<
  TParams extends Record<string, string> = Record<string, string>,
  TSearch extends Record<string, string | string[] | undefined> = Record<
    string,
    string | string[] | undefined
  >,
> = {
  params: Promise<TParams>;
  searchParams: Promise<TSearch>;
};

/** ผลลัพธ์มาตรฐานของทุกรายการที่แบ่งหน้าระดับฐานข้อมูล */
export type Paginated<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/** พารามิเตอร์รายการมาตรฐาน — อ่านจาก URL query string */
export type ListParams = {
  page: number;
  pageSize: number;
  q: string;
  sort: string;
  order: "asc" | "desc";
};

export type SearchParamsInput = Record<string, string | string[] | undefined>;
