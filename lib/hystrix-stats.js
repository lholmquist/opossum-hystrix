'use strict';

const { Transform } = require('stream');
const formatter = require('./hystrix-formatter');

/**
 * Stream Hystrix Metrics for a given {@link CircuitBreaker}.
 * A HystrixStats instance is created for every {@link CircuitBreaker}
 * and does not typically need to be created by a user.
 *
 * A HystrixStats instance will listen for all events on the
 * {@link Status#snapshot}
 * and format the data to the proper Hystrix format.
 * Making it easy to construct an Event Stream for a client
 *
 * @class HystrixStats
 * @example
 * const circuit = circuitBreaker(fs.readFile, {});
 *
 * circuit.hystrixStats.getHystrixStream().pipe(response);
 * @param {CircuitBreaker} the circuit breaker
 * @see CircuitBreaker#hystrixStats
 */
class HystrixStats {
  constructor (circuits) {
    // use a single hystrix stream for all circuits
    this.stream = new Transform({
      objectMode: true,
      transform (stats, encoding, cb) {
        return cb(null, `data: ${JSON.stringify(formatter(stats))}\n\n`);
      }
    });

    circuits.forEach(circuit => {
      _listenForSnapshots(circuit, this.stream);
    });

    this.stream.resume();
  }

  /**
   * Add a circuit to the list of circuits monitored
   * @param {CircuitBreaker} circuit to add to the list of metrics
   * @returns {void}
   */
  add (circuit) {
    _listenForSnapshots(circuit, this.stream);
  }

  /**
    A convenience function that returns the hystrixStream
    @returns {ReadableStream} the statistics stream
  */
  getHystrixStream () {
    return this.stream;
  }

  /**
   * Shuts down this instance, freeing memory.
   * When a circuit is shutdown, it should call shutdown() on
   * its HystrixStats instance to avoid memory leaks.
   * @returns {void}
   */
  shutdown () {
    this.stream.end();
  }
}

function _listenForSnapshots (circuit, stream) {
  // Listen for the stats's snapshot event
  const snapshot = stats => {
    // A little bit of legacy checks to see if we can write.
    // A better approach would be to maintain a list of all the registered
    // circuits and remove the listener from each of them.
    if (stream.destroyed || stream.writableFinished || !stream.writable) {
      circuit.status.removeListener('snapshot', snapshot);
      return;
    }

    // when we get a snapshot push it onto the stream
    stream.write(
      Object.assign({},
        {
          name: circuit.name,
          closed: circuit.closed,
          group: circuit.group,
          options: circuit.options
        }, stats));
  };

  circuit.status.on('snapshot', snapshot);
}

module.exports = exports = HystrixStats;
