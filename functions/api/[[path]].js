/* ============================================================
 * Pages Function — /api/* 同源代理
 *
 * 把 Pages 站点上的 /api/... 请求通过 Service Binding 转发给
 * 独立 Worker（wenxuan-campus-map-api），前端零改动、无 CORS。
 * 请求体、方法、头原样透传，响应直接返回。
 * ============================================================ */

export async function onRequest(context) {
    const url = new URL(context.request.url);
    // Service Binding 只需要一个语法合法的 URL，host 随意
    const target = new Request(
        'https://api.internal' + url.pathname + url.search,
        context.request,
    );
    return context.env.API.fetch(target);
}
