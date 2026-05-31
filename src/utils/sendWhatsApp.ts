export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  try {
    const channelsRes = await fetch('https://api.wazzup24.com/v3/channels', {
      headers: { 'Authorization': `Bearer ${process.env.WAZZUP_API_KEY}` }
    })
    const channelsData = await channelsRes.json() as { transport: string; state: string; channelId: string }[]
    const channel = channelsData.find(c => c.transport === 'whatsapp' && c.state === 'active')
    if (!channel) {
      console.warn('[sendWhatsApp] No active WhatsApp channel')
      return
    }
    await fetch('https://api.wazzup24.com/v3/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.WAZZUP_API_KEY}`,
      },
      body: JSON.stringify({
        channelId: channel.channelId,
        chatType: 'whatsapp',
        chatId: phone,
        text: message,
      }),
    })
  } catch (e) {
    console.error('[sendWhatsApp] Error:', e)
  }
}
