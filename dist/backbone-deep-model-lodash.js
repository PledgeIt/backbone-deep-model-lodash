(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
window.Backbone = window.Backbone || {};
window.Backbone.DeepModel = require('.');

},{".":2}],2:[function(require,module,exports){
try {
	var _ = require('lodash');
} catch (e) {
	var _ = window._;
}
try {
	var bb = require('backbone');
} catch (e) {
	var bb = window.Backbone;
}

module.exports = function () {
	var DeepModel;

	function toPath(str) {
		return str.split('.');
	}

	function deleteNested(obj, path) {
	    var parts = _.isArray(path) ? path : toPath(path),
	        last, parent;

	    // Handle if removing top-level property
	    if (parts.length < 2) {
	        return delete obj[path];
	    }

	    last = parts.pop();
		parent = _.get(obj, parts.join('.'));

	    if (_.isObject(parent)) {
			delete parent[last];
	    }
	}

	DeepModel = bb.Model.extend({

		// Override constructor
		// Support having nested defaults by using _.deepExtend instead of _.extend
		constructor: function(attributes, options) {
			var attrs = attributes || {};
			this.cid = _.uniqueId('c');
			this.attributes = {};
			if (options && options.collection) this.collection = options.collection;
			if (options && options.parse) attrs = this.parse(attrs, options) || {};
	        attrs = _.merge({}, _.result(this, 'defaults'), attrs);
			this.set(attrs, options);
			this.changed = {};
			this.initialize.apply(this, arguments);
		},

		// Return a copy of the model's `attributes` object.
		toJSON: function(options) {
			return _.cloneDeep(this.attributes);
		},

		// Override get
		// Supports nested attributes via the syntax 'obj.attr' e.g. 'author.user.name'
		get: function(attr) {
	        return _.get(this.attributes, toPath(attr));
		},

		// Override set
		// Supports nested attributes via the syntax 'obj.attr' e.g. 'author.user.name'
		set: function(key, val, options) {
			var attr, attrs, unset, changes, silent, changing, prev, current;
			if (key == null) return this;

			// Handle both `"key", value` and `{key: value}` -style arguments.
			if (_.isObject(key)) {
				attrs = key;
				options = val || {};
			} else {
				(attrs = {})[key] = val;
			}

			options || (options = {});

			// Run validation.
			if (!this._validate(attrs, options)) return false;

			// Extract attributes and options.
			unset = options.unset;
			silent = options.silent;
			changes = [];
			changing = this._changing;
			this._changing = true;

			if (!changing) {
				this._previousAttributes = _.cloneDeep(this.attributes);
				this.changed = {};
			}
			current = this.attributes, prev = this._previousAttributes;

			// Check for changes of `id`.
			if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

	        _.each(attrs, function (val, key) {
				var keyPath = toPath(key);
				if (!_.isEqual(_.get(current, keyPath), val)) { changes.push(key); }
	            if (!_.isEqual(_.get(prev, keyPath), val)) {
	                this.changed[key] = val;
	            } else {
	                delete this.changed[key];
	            }
	            unset ? deleteNested(current, keyPath) : _.set(current, keyPath, val);
	        }, this);

			// Trigger all relevant attribute changes.
			if (!silent) {
				if (changes.length) this._pending = true;

	            var alreadyTriggered = {};

	            _.each(changes, function (key) {
					var parts = toPath(key),
	                    parentKey = '',
						eventsToTrigger = {},
						isFirst = true,
						eventName = key,
						currentValue, poppedKey;

						do {
							// Don't need to continue if we're hitting events
							// that have already been triggered
							if (alreadyTriggered[eventName]) { break; }

							// Grab the current value
							currentValue = _.get(current, parts);

							// Trigger the events, including wildcard if the
							// first run-through
							if (!isFirst) { this.trigger('change:' + eventName + '.*', this, currentValue); }
							this.trigger('change:' + eventName, this, currentValue);

							alreadyTriggered[eventName] = true;
							isFirst = false;
							poppedKey = parts.pop();
							eventName = eventName.slice(0, -(poppedKey.length + 1));
						} while (parts.length);
	            }, this);
			}

			if (changing) return this;
			if (!silent) {
				while (this._pending) {
					this._pending = false;
					this.trigger('change', this, options);
				}
			}
			this._pending = false;
			this._changing = false;
			return this;
		},

		// Clear all attributes on the model, firing `"change"` unless you choose
		// to silence it.
		clear: function(options) {
			var attrs = _.reduce(_.keys(this.attributes), function (obj, key) {
	            return obj[key] = void 0;
	        }, {});

	        return this.set(attrs, _.extend({}, options, {
				unset: true
			}));
		},

		// Determine if the model has changed since the last `"change"` event.
		// If you specify an attribute name, determine if that attribute has changed.
		hasChanged: function (attr) {
			if (attr == null) {
				return !_.isEmpty(this.changed);
			}

			return !_.isUndefined(_.get(this.changed, attr));
		},

		// Return an object containing all the attributes that have changed, or
		// false if there are no changed attributes. Useful for determining what
		// parts of a view need to be updated and/or what attributes need to be
		// persisted to the server. Unset attributes will be set to undefined.
		// You can also pass an attributes object to diff against the model,
		// determining if there *would be* a change.
		changedAttributes: function (diff) {
			if (!diff) { return this.hasChanged() ? this.changed : false; }

	        var changed = _.reduce(_.keys(diff), function (obj, key) {
	            if (diff[key] !== this.changed[key]) {
	                obj[key] = diff[key];
	            }

	            return obj;
	        }, {}, this);

	        return _.isEmpty(changed) ? false : changed;
		},

		// Get the previous value of an attribute, recorded at the time the last
		// `"change"` event was fired.
		previous: function(attr) {
			if (attr == null || !this._previousAttributes) {
				return null;
			}

			return _.get(this._previousAttributes, toPath(attr));
		},

		// Get all of the attributes of the model at the time of the previous
		// `"change"` event.
		previousAttributes: function() {
	        return _.cloneDeep(this._previousAttributes);
		}
	});

	return DeepModel;
}();

},{"backbone":undefined,"lodash":undefined}]},{},[1]);