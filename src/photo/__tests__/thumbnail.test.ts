import { thumbnailSize } from '../thumbnail';

describe('thumbnailSize', () => {
  it('brings the long side down to the edge and keeps the shape', () => {
    expect(thumbnailSize(4000, 3000)).toEqual({ width: 480, height: 360 });
    expect(thumbnailSize(1000, 4000)).toEqual({ width: 120, height: 480 });
  });

  it('never enlarges a small picture', () => {
    expect(thumbnailSize(300, 200)).toEqual({ width: 300, height: 200 });
  });

  it('treats a picture with no size as nothing to draw', () => {
    expect(thumbnailSize(0, 100)).toEqual({ width: 0, height: 0 });
  });
});
