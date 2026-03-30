export function GetPagination(page = 1, take = 10) {
    const limit = Math.max(1, take);
    const currentPage = Math.max(1, page);

    return {
        take: limit,
        skip: (currentPage - 1) * limit,
    };
}
