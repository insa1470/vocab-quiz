// POST /api/login
// body: { name, pin }
// → { userId, name, isNew }
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { name, pin } = await request.json();

    if (!name?.trim() || !pin) {
      return Response.json({ error: '請輸入名字和 PIN' }, { status: 400 });
    }

    const trimName = name.trim();

    // 查詢是否已有此用戶（不分大小寫）
    const existing = await env.DB.prepare(
      'SELECT id, pin FROM users WHERE LOWER(name) = LOWER(?)'
    ).bind(trimName).first();

    if (existing) {
      // 登入：驗證 PIN
      if (String(existing.pin) !== String(pin)) {
        return Response.json({ error: 'PIN 碼錯誤' }, { status: 401 });
      }
      return Response.json({ userId: existing.id, name: trimName, isNew: false });
    }

    // 註冊：建立新用戶
    const result = await env.DB.prepare(
      'INSERT INTO users (name, pin) VALUES (?, ?)'
    ).bind(trimName, String(pin)).run();

    return Response.json({
      userId: result.meta.last_row_id,
      name: trimName,
      isNew: true
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
