local key = KEYS[1]

local current_time = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

redis.call("ZREMRANGEBYSCORE", key, 0, current_time - window)

local count = redis.call("ZCARD", key)

if count >= limit then
    return 0
end

-- Use a unique member (time + random) so same-second requests are all counted
local unique_member = current_time .. ":" .. math.random(1, 2147483647)
redis.call("ZADD", key, current_time, unique_member)

redis.call("EXPIRE", key, window)

return 1