import { useCallback, useRef, useState, } from 'react';
import { useAnimationFrame, } from './useAnimationFrame';

const LEVELS_COUNT = 16;
const GAIN = 1.7;
const BEAT_MIN = 0.15; // level less than this is no beat
const BEAT_HOLD_TIME = 40;
const BEAT_DECAY = 0.9;
// const msecsAvg = 633; // time between beats (msec)

const useAudioAnalyzer = (() => {
  const context = new AudioContext();
  const analyzer = context.createAnalyser();
  analyzer.smoothingTimeConstant = 0.3; // smooths out bar chart movement over time
  analyzer.fftSize = 1024;
  return () => ({
    analyzer,
    context,
  });
})();

const useAudioBufferSourceNode = () => {
  const { analyzer, context, } = useAudioAnalyzer();
  const sourceRef = useRef<AudioBufferSourceNode>(context.createBufferSource());

  return {
    source: sourceRef.current,
    connect: (buffer: AudioBuffer) => {
      sourceRef.current?.disconnect();
      sourceRef.current = context.createBufferSource();
      sourceRef.current.buffer = buffer;
      sourceRef.current.connect(analyzer);
      analyzer.connect(context.destination);
      return sourceRef.current;
    },
  };
};

export const useFreqTimeData = (analyzer: AnalyserNode) => {
  const freq = useRef(new Uint8Array(analyzer.frequencyBinCount));
  const time = useRef(new Uint8Array(analyzer.frequencyBinCount));

  useAnimationFrame(() => {
    if (analyzer.context.state !== 'suspended') {
      analyzer.getByteFrequencyData(freq.current); // <-- bar chart
      analyzer.getByteTimeDomainData(time.current); // <-- waveform
    }
  });

  return {
    freq: freq.current,
    time: time.current,
  };
};

export interface LevelData {
  levels: number[];
  /**
   * Value between 0 and 1.
   */
  volume: number;
}

export const useLevelData = (analyzer: AnalyserNode, cb: (data: LevelData) => void) => {
  const { freq, } = useFreqTimeData(analyzer);
  /** 32 bins per level for  16 levels, 512 bins */
  const binsPerLevel = Math.floor(analyzer.frequencyBinCount / LEVELS_COUNT);

  useAnimationFrame(() => {
    if (analyzer.context.state === 'suspended') return;

    const data: number[] = [];

    for (let i = 0; i < LEVELS_COUNT; i++) {
      let levelSum = 0;
      for (let j = 0; j < binsPerLevel; j++) {
        levelSum += freq[i * binsPerLevel + j];
      }
      data[i] = levelSum / binsPerLevel / 256 * GAIN; // freqData maxs at 256
    }

    // GET AVG LEVEL
    const sum = data.slice(0, LEVELS_COUNT).reduce((s, x) => s + x, 0);
    cb({
      levels: data,
      volume: sum / LEVELS_COUNT,
    });
  });
};

export const useBeat = (analyzer: AnalyserNode, cb: (data: LevelData) => void) => {
  const beatCutOff = useRef(0);
  const beatTime = useRef(0);

  useLevelData(analyzer, ({ levels, volume, }) => {
    if (volume > beatCutOff.current && volume > BEAT_MIN) {
      cb({ levels, volume, });
      beatCutOff.current = volume * 1.1;
      beatTime.current = 0;
    }
    else if (beatTime.current <= BEAT_HOLD_TIME) {
      beatTime.current++;
    }
    else {
      beatCutOff.current *= BEAT_DECAY;
      beatCutOff.current = Math.max(beatCutOff.current, BEAT_MIN);
    }
  });
};

export const useMusik = () => {
  const { analyzer, context, } = useAudioAnalyzer();
  // const { connect, } = useAudioBufferSourceNode();
  // const [ isLoading, setIsLoading, ] = useState(false);
  // const [ isPlaying, setIsPlaying, ] = useState(context.state === 'running');

  // const onAudioBuffer = useCallback((buffer: AudioBuffer) => {
  //   connect(buffer).start();
  // }, [ connect, ]);

  // context.onstatechange = () => {
  //   setIsPlaying(context.state === 'running');
  // };

  return {
    // isLoading,
    // isPlaying,
    play: () => context.resume(),
    pause: () => context.suspend(),
  };
};
