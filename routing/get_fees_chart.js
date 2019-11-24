const asyncAuto = require('async/auto');
const {getForwards} = require('ln-service');
const {getNode} = require('ln-service');
const moment = require('moment');
const {returnResult} = require('asyncjs-util');

const daysPerWeek = 7;
const {floor} = Math;
const hoursPerDay = 24;
const limit = 99999;
const minChartDays = 4;
const maxChartDays = 90;
const notFound = -1;
const uniq = arr => Array.from(new Set(arr));

/** Get data for fees chart

  {
    days: <Fees Earned Over Days Count Number>
    lnd: <Authenticated LND gRPC API Object>
    via: <Via Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    description: <Chart Description String>
    fees: [<Earned Fee Tokens Number>]
    title: <Chart Title String>
  }
*/
module.exports = ({days, lnd, via}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!days) {
          return cbk([400, 'ExpectedNumberOfDaysToGetFeesOverForChart']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToGetFeesChart']);
        }

        return cbk();
      },

      // Get node details
      getNode: ['validate', ({}, cbk) => {
        return !via ? cbk() : getNode({lnd, public_key: via}, cbk);
      }],

      // Segment measure
      measure: ['validate', ({}, cbk) => {
        if (days > maxChartDays) {
          return cbk(null, 'week');
        } else if (days < minChartDays) {
          return cbk(null, 'hour');
        } else {
          return cbk(null, 'day');
        }
      }],

      // Start date for forwards
      start: ['validate', ({}, cbk) => {
        return cbk(null, moment().subtract(days, 'days'));
      }],

      // Get forwards
      getForwards: ['start', ({start}, cbk) => {
        return getForwards({
          limit,
          lnd,
          after: start.toISOString(),
          before: new Date().toISOString(),
        },
        cbk);
      }],

      // Filter the forwards
      forwards: ['getForwards', 'getNode', ({getForwards, getNode}, cbk) => {
        if (!via) {
          return cbk(null, getForwards.forwards);
        }

        const channelIds = uniq(getNode.channels.map(({id}) => id));

        const forwards = getForwards.forwards.filter(forward => {
          if (channelIds.indexOf(forward.incoming_channel) !== notFound) {
            return true;
          }

          if (channelIds.indexOf(forward.outgoing_channel) !== notFound) {
            return true;
          }

          return false;
        });

        return cbk(null, forwards);
      }],

      // Total earnings
      totalEarned: ['forwards', ({forwards}, cbk) => {
        return cbk(null, forwards.reduce((sum, {fee}) => sum + fee, Number()));
      }],

      // Total number of segments
      segments: ['measure', ({measure}, cbk) => {
        switch (measure) {
        case 'hour':
          return cbk(null, hoursPerDay * days);

        case 'week':
          return cbk(null, floor(days / daysPerWeek));

        default:
          return cbk(null, days);
        }
      }],

      // Fees earned
      fees: [
        'forwards',
        'measure',
        'segments',
        ({forwards, measure, segments}, cbk) =>
      {
        const fees = [...Array(segments)].map((_, i) => {
          const segment = moment().subtract(i, measure);

          const segmentForwards = forwards.filter(forward => {
            const forwardDate = moment(forward.created_at);

            if (segment.year() !== forwardDate.year()) {
              return false;
            }

            const isSameDay = segment.dayOfYear() === forwardDate.dayOfYear();

            switch (measure) {
            case 'hour':
              return isSameDay && segment.hour() === forwardDate.hour();

            case 'week':
              return segment.week() === forwardDate.week();

            default:
              return isSameDay;
            }
          });

          return segmentForwards.reduce((sum, {fee}) => sum + fee, Number());
        });

        return cbk(null, fees.slice().reverse());
      }],

      // Summary description of the fees earned
      description: [
        'fees',
        'measure',
        'start',
        'totalEarned',
        ({fees, measure, start, totalEarned}, cbk) =>
      {
        const duration = `Earned in ${fees.length} ${measure}s`;
        const earned = (totalEarned / 1e8).toFixed(8);
        const since = `since ${start.calendar().toLowerCase()}`;

        return cbk(null, `${duration} ${since}. Total: ${earned}`);
      }],

      // Summary title of the fees earned
      title: ['getNode', ({getNode}, cbk) => {
        const title = 'Routing fees earned';

        if (!via) {
          return cbk(null, title);
        }

        return cbk(null, `${title} via ${getNode.alias}`);
      }],

      // Earnings
      earnings: [
        'description',
        'fees',
        'title',
        ({description, fees, title}, cbk) =>
      {
        return cbk(null, {description, fees, title});
      }],
    },
    returnResult({reject, resolve, of: 'earnings'}, cbk));
  });
};