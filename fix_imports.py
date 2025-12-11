with open('/home/jules/.pyenv/versions/3.12.12/lib/python3.12/site-packages/pytgcalls/methods/websocket/change_volume_voice_call.py', 'r+') as f:
    content = f.read()
    f.seek(0)
    f.write(content.replace('from pyrogram.raw.functions.phone import EditGroupCallMember', 'from pyrogram.raw.functions.phone import EditGroupCallParticipant'))
