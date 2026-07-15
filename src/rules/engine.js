const logger = require('../utils/logger');

/**
 * Evaluates shipping rules against a cart (used by the rate preview).
 * Returns an array of matching rate objects.
 *
 * Price note: Shopify expects total_price in the smallest currency unit (cents).
 * All prices in shipping-rules.json are already stored in cents (e.g. 495 = 4,95 EUR).
 */
class RuleEngine {
  constructor(rules) {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * @param {object} payload - Shopify carrier service request body (.rate)
   * @returns {Array} Shopify-formatted rate objects
   */
  evaluate(payload) {
    const { destination, items, currency } = payload;
    const cartWeightGrams = this._totalWeight(items);
    const cartPriceCents = this._totalPrice(items);
    const hasProductTag = (tag) => items.some((i) => (i.product_tags || []).includes(tag));

    const matchedRates = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (!this._matchesConditions(rule.conditions, {
        destination,
        cartWeightGrams,
        cartPriceCents,
        hasProductTag,
      })) {
        continue;
      }

      logger.debug(`Rule matched: ${rule.name}`, {
        ruleId: rule.id,
        destination: destination.country,
        cartWeightGrams,
        cartPriceCents,
      });

      for (const rate of rule.rates) {
        matchedRates.push(this._formatRate(rate, currency));
      }
    }

    if (matchedRates.length === 0) {
      logger.warn('No shipping rules matched — returning empty rates', {
        country: destination?.country,
        cartWeightGrams,
      });
    }

    return matchedRates;
  }

  _matchesConditions(conditions, context) {
    const { destination, cartWeightGrams, cartPriceCents, hasProductTag } = context;

    if (conditions.destinationCountries && conditions.destinationCountries.length > 0) {
      if (!conditions.destinationCountries.includes(destination.country)) return false;
    }

    if (conditions.minWeightGrams !== undefined && cartWeightGrams < conditions.minWeightGrams) {
      return false;
    }

    if (conditions.maxWeightGrams !== undefined && cartWeightGrams > conditions.maxWeightGrams) {
      return false;
    }

    if (conditions.minCartPrice !== undefined && cartPriceCents < conditions.minCartPrice) {
      return false;
    }

    if (conditions.maxCartPrice !== undefined && cartPriceCents > conditions.maxCartPrice) {
      return false;
    }

    if (conditions.requireProductTags && conditions.requireProductTags.length > 0) {
      // One matching tag is enough — multiple tags act as synonyms
      const anyPresent = conditions.requireProductTags.some((tag) => hasProductTag(tag));
      if (!anyPresent) return false;
    }

    if (conditions.excludeProductTags && conditions.excludeProductTags.length > 0) {
      const anyPresent = conditions.excludeProductTags.some((tag) => hasProductTag(tag));
      if (anyPresent) return false;
    }

    return true;
  }

  _formatRate(rate, requestCurrency) {
    const today = new Date();
    const minDate = this._addWorkdays(today, rate.minDeliveryDays);
    const maxDate = this._addWorkdays(today, rate.maxDeliveryDays);

    return {
      service_name: rate.serviceName,
      service_code: rate.serviceCode,
      total_price: String(rate.price),
      description: rate.description || '',
      currency: requestCurrency || 'EUR',
      min_delivery_date: minDate.toISOString().split('T')[0],
      max_delivery_date: maxDate.toISOString().split('T')[0],
    };
  }

  _totalWeight(items) {
    return items.reduce((sum, item) => sum + (item.grams || 0) * (item.quantity || 1), 0);
  }

  _totalPrice(items) {
    return items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);
  }

  /** Adds n working days (Mon–Fri), skipping weekends. */
  _addWorkdays(date, days) {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const dow = result.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    return result;
  }
}

module.exports = RuleEngine;
