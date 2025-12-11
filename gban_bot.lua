--[[
    Global Ban Telegram Bot in Lua

    This bot allows an administrator to permanently ban a user from all groups
    where the bot is a member and has ban permissions.

    Dependencies:
    - lua-telegram-bot: https://github.com/ldb/lua-telegram-bot
    - luasec: `luarocks install luasec`
    - dkjson: `luarocks install dkjson`
]]

-- Load required libraries
local telegram_bot = require("lua-bot-api")
local json = require("dkjson")
local https = require("ssl.https")

-- ===================================================================
--                       CONFIGURATION
-- ===================================================================

-- Replace with your Telegram Bot Token
local bot_token = "YOUR_BOT_TOKEN_HERE"

-- The user ID of the bot's administrator. Only this user can issue the /gban command.
-- You can add more admins by creating a table of user IDs.
-- Example: local admin_users = {123456789, 987654321}
local admin_user_id = 123456789

-- File to store the list of groups the bot is in
local groups_file = "groups.json"

-- ===================================================================
--                       HELPER FUNCTIONS
-- ===================================================================

-- Function to check if a user is an admin
local function is_admin(user_id)
    if type(admin_user_id) == "table" then
        for _, id in ipairs(admin_user_id) do
            if id == user_id then
                return true
            end
        end
        return false
    else
        return user_id == admin_user_id
    end
end

-- Function to save the groups list to a file
local function save_groups(groups)
    local file = io.open(groups_file, "w")
    if file then
        file:write(json.encode(groups))
        file:close()
    end
end

-- Function to load the groups list from a file
local function load_groups()
    local file = io.open(groups_file, "r")
    if file then
        local content = file:read("*a")
        file:close()
        local success, groups = pcall(json.decode, content)
        if success then
            return groups or {}
        end
    end
    return {}
end

-- Function to add a group ID to the list if it's not already there
local function add_group(chat_id)
    local groups = load_groups()
    local found = false
    for _, id in ipairs(groups) do
        if id == chat_id then
            found = true
            break
        end
    end
    if not found then
        table.insert(groups, chat_id)
        save_groups(groups)
        print("Added new group to list: " .. chat_id)
    end
end

-- ===================================================================
--                          MAIN BOT LOGIC
-- ===================================================================

local bot = telegram_bot.configure(bot_token)

-- Main message handler
bot:on_message(function(message)
    -- Ignore messages that are not text
    if not message.text then
        return
    end

    -- Add the group to our list if it's a group chat
    if message.chat.type == "group" or message.chat.type == "supergroup" then
        add_group(message.chat.id)
    end

    -- Check if the command is from an admin
    if not is_admin(message.from.id) then
        return
    end

    -- Command handler for /gban
    if message.text:match("^/gban") then
        local target_user_id

        -- Case 1: /gban is a reply to a user's message
        if message.reply_to_message then
            target_user_id = message.reply_to_message.from.id
        -- Case 2: /gban is followed by a user ID
        else
            target_user_id = message.text:match("^/gban (%d+)")
        end

        if not target_user_id then
            bot:send_message(message.chat.id, "Usage:\n- Reply /gban to a user's message.\n- Use /gban [user_id].")
            return
        end

        target_user_id = tonumber(target_user_id)

        -- Don't let the admin ban themselves
        if is_admin(target_user_id) then
            bot:send_message(message.chat.id, "You cannot ban an administrator.")
            return
        end

        bot:send_message(message.chat.id, "Initiating global ban for user " .. target_user_id .. ". This may take a moment...")

        local groups = load_groups()
        local ban_count = 0
        local error_count = 0

        for _, group_id in ipairs(groups) do
            -- The 'kickChatMember' method in this library performs a ban.
            -- The Telegram API docs confirm 'kickChatMember' is the old name for 'banChatMember'.
            -- It permanently bans the user unless they are unbanned later.
            local success, result = bot:kick_chat_member(group_id, target_user_id)
            if success and result.ok then
                ban_count = ban_count + 1
            else
                error_count = error_count + 1
                -- Optional: Log errors for debugging
                print("Failed to ban user from group " .. group_id)
            end
        end

        bot:send_message(message.chat.id,
            "Global ban complete.\n- Successfully banned from: " .. ban_count .. " groups.\n- Failed in: " .. error_count .. " groups (I might not be an admin there).")
    end
end)

-- Start polling for updates
print("Bot is running...")
bot:start_polling()