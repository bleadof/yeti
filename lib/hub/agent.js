var util = require("util");
var EventEmitter2 = require("eventemitter2").EventEmitter2;

var parseUA = require("./ua");

// TODO: Periodic GC of missing Agents.
// var periodic = require("./periodic");

function Agent(registration) {
    this.id = registration.id;
    this.ua = registration.ua;

    if (!this.id) {
        throw new Error("ID required.");
    } else if (!this.ua) {
        throw new Error("UA required.");
    }

    this.name = parseUA(this.ua.userAgent);

    this.seen = new Date();
    this.waiting = true;
    this.connected = true;

    this.urlQueue = [];

    EventEmitter2.call(this);

    this.setupEvents();
    this.connect(registration.socket);
};

util.inherits(Agent, EventEmitter2);

Agent.prototype.setupEvents = function () {
    var self = this;
    /*
    self.on("disconnect", function () {
        console.log("disconnected.");
        self.seen = new Date();
        self.connected = false;
        self.socket = null;
    });

    self.on("results", function () {
        console.log("Got results:", data);
      // TODO push to Batch API
    });
    */
};

Agent.prototype.getName = function () {
    return this.name;
};

Agent.prototype.getId = function () {
    return this.id;
};

// Agents only have one thing at a time.

Agent.prototype.connect = function (socket) {
    var self = this;
    self.socket = socket;

    self.socket.once("disconnect", function () {
        // XXX TODO -- Need to GC disconnected sockets
        // Periodically check how old their last seen date was.
        // self.emit("disconnect");
        console.warn("Agent disconnect event not implemented. Perhaps update the lastSeen time and flag as offline?");
        console.warn("Possible future memory leak - Agent will never be cleaned up.");
    });

    self.socket.on("results", function (data) {
        self.emit("results", data);
        self.next();
    });

    self.socket.on("scriptError", function (details) {
        self.emit("scriptError", details);
        self.next();
    });
};

Agent.prototype.next = function () {
    if (this.urlQueue.length) {
        this.socket.emit("test", this.urlQueue.pop());
        this.waiting = false;
        return true;
    } else {
        this.waiting = true;
        this.socket.emit("complete");
        this.emit("complete");
        return false;
    }
};

Agent.prototype.available = function () {
    return this.waiting;
};

Agent.prototype.dispatch = function (urls) {
    if (!this.alive()) {
        throw new Error("Agent is dead.");
    }

    this.urlQueue = urls;

    this.next();
};

Agent.prototype.alive = function () {
    return this.connected ||
        (!this.waiting && ((Date.now() - this.seen) > 3600));
};

function AgentManager() {
    this.agents = {};
    EventEmitter2.call(this, {
        verbose:true
    });
}

util.inherits(AgentManager, EventEmitter2);

AgentManager.prototype.getAgents = function () {
    var out = [],
        self = this;
    Object.keys(self.agents).forEach(function (id) {
        out.push(self.agents[id]);
    });
    return out;
};

AgentManager.prototype.getAgent = function (id) {
    return this.agents[id];
};

AgentManager.prototype.connectAgent = function (id, ua, socket) {
    var self = this;
        agent = self.agents[id];

    if (!id) {
        throw new Error("ID required.");
    } else if (!socket) {
        throw new Error("Socket required.");
    }

    if (agent) {
        agent.connect(socket);
    } else {
        agent = self.agents[id] = new Agent({
            id: id,
            ua: ua,
            socket: socket
        });
    }

    // XXX Serialize the agent to JSON.
    self.emit("agentConnect", agent.getName());
    agent.once("disconnect", function () {
        delete self.agents[agent.id];
        self.emit("agentDisconnect", agent.getName());
    });
};

exports.Agent = Agent;
exports.AgentManager = AgentManager;