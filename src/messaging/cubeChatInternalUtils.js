'use strict';

const Utils = require('../cubeInternalUtils'),
    Config = require('../cubeConfig'),
    XMPP = require('../cubeDependencies').XMPPClient,
    ERR_UNKNOWN_INTERFACE = 'Unknown interface. SDK support browser / node env.',
    MARKERS = {
        CLIENT: 'jabber:client',
        CHAT: 'urn:xmpp:chat-markers:0',
        STATES: 'http://jabber.org/protocol/chatstates',
        MARKERS: 'urn:xmpp:chat-markers:0',
        CARBONS: 'urn:xmpp:carbons:2',
        ROSTER: 'jabber:iq:roster',
        MUC: 'http://jabber.org/protocol/muc',
        PRIVACY: 'jabber:iq:privacy',
        LAST: 'jabber:iq:last'
    };

var cbChatHelpers = {
    MARKERS: MARKERS,

    /**
     * @param {params} this object may contains Jid or Id property
     * @return {string} jid of user
     */
    buildUserJid: function(params) {
        var jid;

        if ('userId' in params) {
            jid = params.userId + '-' + Config.creds.appId + '@' + Config.endpoints.chat;

            if ('resource' in params) {
                jid = jid + '/' + params.resource;
            }
        } else if ('jid' in params) {
            jid = params.jid;
        }

        return jid;
    },
    buildUserJidLocalPart: function(userId) {
        return userId + '-' + Config.creds.appId;
    },
    createMessageStanza: function(params) {
        if (Utils.getEnv().browser) {
            return $msg(params);
        } else if (Utils.getEnv().reactnative) {
            return XMPP.xml('message', params);
        } else {
            // Node.js & Native Script
            return new XMPP.Stanza('message', params);
        }
    },
    createIqStanza: function(params) {
        if (Utils.getEnv().browser) {
            return $iq(params);
        } else if (Utils.getEnv().reactnative) {
            return XMPP.xml('iq', params);
        } else {
            // Node.js & Native Script
            return new XMPP.Stanza('iq', params);
        }
    },
    createPresenceStanza: function(params) {
        if (Utils.getEnv().browser) {
            return $pres(params);
        } else if (Utils.getEnv().reactnative) {
            return XMPP.xml('presence', params);
        } else {
            // Node.js & Native Script
            return new XMPP.Stanza('presence', params);
        }
    },
    createNonza: function(elementName, params) {
        if (Utils.getEnv().browser) {
            return $build(elementName, params);
        } else if (Utils.getEnv().reactnative) {
            return XMPP.xml(elementName, params);
        } else {
            // Node.js & Native Script
            return new XMPP.Stanza(elementName, params);
        }
    },
    getAttr: function(el, attrName) {
        var attr;

        if (!el) {
            return null;
        }

        if (typeof el.getAttribute === 'function') {
            attr = el.getAttribute(attrName);
        } else if (el.attrs) {
            attr = el.attrs[attrName];
        }

        return attr ? attr : null;
    },
    getElement: function(stanza, elName) {
        var el;

        if (typeof stanza.querySelector === 'function') {
            el = stanza.querySelector(elName);
        } else if (typeof stanza.getChild === 'function') {
            el = stanza.getChild(elName);
        } else {
            throw ERR_UNKNOWN_INTERFACE;
        }

        return el ? el : null;
    },
    getAllElements: function(stanza, elName) {
        var el;

        if (typeof stanza.querySelectorAll === 'function') {
            el = stanza.querySelectorAll(elName);
        } else if (typeof stanza.getChild === 'function') {
            el = stanza.getChild(elName);
        } else {
            throw ERR_UNKNOWN_INTERFACE;
        }

        return el ? el : null;
    },
    getElementText: function(stanza, elName) {
        var el, txt;

        if (typeof stanza.querySelector === 'function') {
            el = stanza.querySelector(elName);
            txt = el ? el.textContent : null;
        } else if (typeof stanza.getChildText === 'function') {
            txt = stanza.getChildText(elName);
        } else {
            throw ERR_UNKNOWN_INTERFACE;
        }

        return txt ? txt : null;
    },
    _JStoXML: function(title, obj, msg) {
        var self = this;

        msg = msg.c(title);

        Object.keys(obj).forEach(function(field) {
            if (typeof obj[field] === 'object') {
                self._JStoXML(field, obj[field], msg);
            } else {
                msg = msg.c(field).t(obj[field]).up();
            }
        });

        msg = msg.up();
    },
    _XMLtoJS: function(extension, title, obj) {
        extension[title] = {};

        var objChildNodes = obj.childNodes || obj.children;

        for (var i = 0; i < objChildNodes.length; i++) {
            var subNode = objChildNodes[i];
            var subNodeChildNodes = subNode.childNodes || subNode.children;
            var subNodeTagName = subNode.tagName || subNode.name;
            var subNodeTextContent = subNode.textContent || subNode.children[0];

            if (subNodeChildNodes.length > 1) {
                extension[title] = this._XMLtoJS(extension[title], subNodeTagName, subNode);
            } else {
                extension[title][subNodeTagName] = subNodeTextContent;
            }
        }
        return extension;
    },
    filledExtraParams: function(stanza, extension) {
        var helper = this;

        Object.keys(extension).forEach(function(field) {
            if (field === 'attachments') {
                extension[field].forEach(function(attach) {
                    if (Utils.getEnv().browser) {
                        stanza.c('attachment', attach).up();
                    } else {
                        stanza
                            .getChild('extraParams')
                            .c('attachment', attach)
                            .up();
                    }
                });
            } else if (typeof extension[field] === 'object') {
                helper._JStoXML(field, extension[field], stanza);
            } else {
                if (Utils.getEnv().browser) {
                    stanza
                        .c(field)
                        .t(extension[field])
                        .up();
                } else {
                    stanza
                        .getChild('extraParams')
                        .c(field)
                        .t(extension[field])
                        .up();
                }
            }
        });

        stanza.up();

        return stanza;
    },
    parseExtraParams: function(extraParams) {
        var self = this;

        if (!extraParams) {
            return null;
        }

        var extension = {};

        var dialogId, attach, attributes;

        var attachments = [];

        if (Utils.getEnv().browser) {
            for (var i = 0, len = extraParams.childNodes.length; i < len; i++) {
                // parse attachments
                if (extraParams.childNodes[i].tagName === 'attachment') {
                    attach = {};
                    attributes = extraParams.childNodes[i].attributes;

                    for (var j = 0, len2 = attributes.length; j < len2; j++) {
                        if (attributes[j].name === 'size') {
                            attach[attributes[j].name] = parseInt(attributes[j].value);
                        } else {
                            attach[attributes[j].name] = attributes[j].value;
                        }
                    }

                    attachments.push(attach);

                    // parse 'dialog_id'
                } else if (extraParams.childNodes[i].tagName === 'dialog_id') {
                    dialogId = extraParams.childNodes[i].textContent;
                    extension.dialog_id = dialogId;

                    // parse other user's custom parameters
                } else {
                    if (extraParams.childNodes[i].childNodes.length > 1) {
                        // Firefox issue with 4K XML node limit:
                        // http://www.coderholic.com/firefox-4k-xml-node-limit/
                        var nodeTextContentSize = extraParams.childNodes[i].textContent.length;

                        if (nodeTextContentSize > 4096) {
                            var wholeNodeContent = '';
                            for (var k = 0; k < extraParams.childNodes[i].childNodes.length; ++k) {
                                wholeNodeContent += extraParams.childNodes[i].childNodes[k].textContent;
                            }
                            extension[extraParams.childNodes[i].tagName] = wholeNodeContent;
                        } else {
                            extension = self._XMLtoJS(
                                extension,
                                extraParams.childNodes[i].tagName,
                                extraParams.childNodes[i]
                            );
                        }
                    } else {
                        extension[extraParams.childNodes[i].tagName] = extraParams.childNodes[i].textContent;
                    }
                }
            }
        } else {
            for (var c = 0, lenght = extraParams.children.length; c < lenght; c++) {
                if (extraParams.children[c].name === 'attachment') {
                    attach = {};
                    attributes = extraParams.children[c].attrs;

                    var attrKeys = Object.keys(attributes);

                    for (var l = 0; l < attrKeys.length; l++) {
                        if (attrKeys[l] === 'size') {
                            attach.size = parseInt(attributes.size);
                        } else {
                            attach[attrKeys[l]] = attributes[attrKeys[l]];
                        }
                    }

                    attachments.push(attach);
                } else if (extraParams.children[c].name === 'dialog_id') {
                    dialogId = extraParams.getChildText('dialog_id');
                    extension.dialog_id = dialogId;
                }

                if (extraParams.children[c].children.length === 1) {
                    var child = extraParams.children[c];

                    extension[child.name] = child.children[0];
                }
            }
        }

        if (attachments.length > 0) {
            extension.attachments = attachments;
        }

        if (extension.moduleIdentifier) {
            delete extension.moduleIdentifier;
        }

        return {
            extension: extension,
            dialogId: dialogId
        };
    },
    getUniqueId: function(suffix) {
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (Math.random() * 16) | 0,
                v = c == 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
        if (typeof suffix == 'string' || typeof suffix == 'number') {
            return uuid + ':' + suffix;
        } else {
            return uuid + '';
        }
    },
    getErrorFromXMLNode: function(stanzaError) {
        var errorElement = this.getElement(stanzaError, 'error');
        var errorCode = parseInt(this.getAttr(errorElement, 'code'));
        var errorText = this.getElementText(errorElement, 'text');

        return Utils.getError(errorCode, errorText);
    }
};

module.exports = cbChatHelpers;