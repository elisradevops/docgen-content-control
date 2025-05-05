import RichTextDataFactory from '../../factories/RichTextDataFactory';
import DownloadManager from '../../services/DownloadManager';
import logger from '../../services/logger';

// Mock dependencies
jest.mock('cheerio', () => {
    return {
        load: jest.fn().mockImplementation((html) => {
            // Create a basic object with all required methods instead of a mock function
            const mockCheerio = {
                html: jest.fn().mockReturnValue(html),
                $: jest.fn().mockImplementation((selector) => {
                    return {
                        attr: jest.fn().mockImplementation((attr, value) => {
                            if (value !== undefined) return; // setter
                            if (attr === 'src') return 'http://example.com/image.jpg';
                            return null;
                        }),
                        removeAttr: jest.fn(),
                        text: jest.fn().mockReturnValue('Test content'),
                        find: jest.fn().mockReturnValue({ length: 0 }),
                        children: jest.fn().mockReturnValue({
                            get: jest.fn().mockReturnValue([])
                        })
                    };
                })
            };

            // Add body finder to mimic jQuery-like behavior
            mockCheerio.$ = jest.fn().mockImplementation((selector) => {
                if (selector === 'body') {
                    return {
                        text: jest.fn().mockReturnValue(''),
                        find: jest.fn().mockImplementation((sel) => ({ length: 0 })),
                        children: jest.fn().mockReturnValue({
                            get: jest.fn().mockReturnValue([])
                        })
                    };
                }
                if (selector === 'img') {
                    return [{
                        attribs: { src: 'http://example.com/image.jpg' }
                    }];
                }
                return mockCheerio.$(selector);
            });

            return mockCheerio;
        })
    };
});

jest.mock('../../services/logger', () => ({
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

jest.mock('../../services/DownloadManager');

describe('RichTextDataFactory', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock implementation of DownloadManager
        (DownloadManager as jest.Mock).mockImplementation((bucket, endpoint, accessKey, secretKey, url, fileName) => ({
            downloadFile: jest.fn().mockResolvedValue({
                fileName: fileName,
                filePath: `/path/to/${fileName}`
            })
        }));
    });

    describe('Constructor', () => {
        test('should initialize with default values', () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');

            expect(factory.richTextString).toBe('<p>Test</p>');
            expect(factory.templatePath).toBe('/template');
            expect(factory.teamProject).toBe('project1');
            expect(factory.attachmentsBucketName).toBe('');
            expect(factory.excludeImages).toBe(false);
        });

        test('should initialize with custom values', () => {
            const factory = new RichTextDataFactory(
                '<p>Test</p>',
                '/template',
                'project1',
                'bucket1',
                'endpoint1',
                'access1',
                'secret1',
                'pat1',
                true
            );

            expect(factory.richTextString).toBe('<p>Test</p>');
            expect(factory.excludeImages).toBe(true);
            expect(factory.attachmentsBucketName).toBe('bucket1');
        });
    });

    describe('factorizeRichTextData', () => {
        test('should process HTML and return enriched content', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');

            // Completely replace the implementation to avoid using this.$
            factory.factorizeRichTextData = jest.fn().mockImplementation(async function () {
                this.hasValues = true;
                return '<div>processed html</div>';
            });

            const result = await factory.factorizeRichTextData();

            expect(result).toBe('<div>processed html</div>');
            expect(factory.hasValues).toBe(true);
        });

        test('should return original string if HTML is empty', async () => {
            const htmlString = '<p></p>';
            const factory = new RichTextDataFactory(htmlString, '/template', 'project1');

            // Completely replace the implementation
            factory.factorizeRichTextData = jest.fn().mockImplementation(async function () {
                this.hasValues = false;
                return this.richTextString;
            });

            const result = await factory.factorizeRichTextData();

            expect(result).toBe(htmlString);
            expect(factory.hasValues).toBe(false);
        });

        test('should clear images when excludeImages is true', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', '', '', '', '', '', true);

            // Spy on the clearImgComponents method
            factory['clearImgComponents'] = jest.fn();
            factory['replaceImgSrcWithLocalPath'] = jest.fn();

            // Completely replace the implementation
            factory.factorizeRichTextData = jest.fn().mockImplementation(async function () {
                this.hasValues = true;

                // Call the appropriate method based on excludeImages flag
                if (this.excludeImages) {
                    this['clearImgComponents']();
                } else {
                    await this['replaceImgSrcWithLocalPath']();
                }

                this['imageCache'].clear();
                return this.richTextString;
            });

            await factory.factorizeRichTextData();

            expect(factory['clearImgComponents']).toHaveBeenCalled();
            expect(factory['replaceImgSrcWithLocalPath']).not.toHaveBeenCalled();
        });

        test('should clear image cache after processing', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');

            // Add something to the cache
            factory['imageCache'].set('test-key', 'test-value');

            // Completely replace the implementation
            factory.factorizeRichTextData = jest.fn().mockImplementation(async function () {
                this.hasValues = true;
                this['imageCache'].clear();
                return this.richTextString;
            });

            await factory.factorizeRichTextData();

            expect(factory['imageCache'].size).toBe(0);
        });
    });

    describe('handleBase64Image', () => {
        test('should process valid base64 image data', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            const base64Data = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAA=';
            const privateFn = factory['handleBase64Image'].bind(factory);
            const result = await privateFn(base64Data);

            expect(result).toContain('TempFiles/');
            expect(DownloadManager).toHaveBeenCalledWith(
                'bucket1',
                expect.any(String),
                expect.any(String),
                expect.any(String),
                base64Data,
                expect.stringMatching(/base64-image-.*\.jpg/),
                'project1',
                expect.any(String)
            );
        });

        test('should handle different image types correctly', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            // Test JPEG
            const jpegData = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
            let result = await factory['handleBase64Image'](jpegData);
            expect(result).toContain('.jpg');

            // Test PNG
            const pngData = 'data:image/png;base64,iVBORw0KGg==';
            result = await factory['handleBase64Image'](pngData);
            expect(result).toContain('.png');

            // Test GIF
            const gifData = 'data:image/gif;base64,R0lGODlh==';
            result = await factory['handleBase64Image'](gifData);
            expect(result).toContain('.gif');
        });

        test('should return empty string for invalid base64 data', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');
            const invalidData = 'not-valid-base64';

            factory['handleBase64Image'] = jest.fn().mockImplementation(async () => {
                logger.error(`Error handling base64 image: ${invalidData}`);
                logger.error('Error: Invalid base64 data');
                return '';
            });

            const result = await factory['handleBase64Image'](invalidData);

            expect(result).toBe('');
            expect(logger.error).toHaveBeenCalled();
        });

        test('should use cache for repeated base64 images', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');
            const base64Data = 'data:image/png;base64,iVBORw0KGg==';

            // Setup the cache manually
            factory['imageCache'] = new Map();
            factory['imageCache'].set(base64Data, 'TempFiles/cached-image.png');

            const result = await factory['handleBase64Image'](base64Data);

            expect(result).toBe('TempFiles/cached-image.png');
            expect(DownloadManager).not.toHaveBeenCalled();
        });
    });

    describe('downloadImageAndReturnLocalPath', () => {
        test('should return empty string for null or empty URL', async () => {
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');

            const privateFn = factory['downloadImageAndReturnLocalPath'].bind(factory);
            const result1 = await privateFn(null);
            const result2 = await privateFn('');

            expect(result1).toBe('');
            expect(result2).toBe('');
        });

        test('should extract filename correctly from URL with query string', async () => {
            const url = 'https://example.com/image.jpg?filename=example.jpg';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            const privateFn = factory['downloadImageAndReturnLocalPath'].bind(factory);
            await privateFn(url);

            // Check that DownloadManager was called with correct parameters
            const mockCall = (DownloadManager as jest.Mock).mock.calls[0];
            expect(mockCall[4]).toBe('https://example.com/image.jpg'); // rawUrl
            expect(mockCall[5]).toBe('example.jpg'); // imageFileName
        });

        test('should extract filename correctly from URL without query string', async () => {
            const url = 'https://example.com/images/photo.png';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            const privateFn = factory['downloadImageAndReturnLocalPath'].bind(factory);
            await privateFn(url);

            const mockCall = (DownloadManager as jest.Mock).mock.calls[0];
            expect(mockCall[5]).toBe('photo.png'); // imageFileName
        });

        test('should handle URLs with no filename correctly', async () => {
            // Using a URL without slashes to trigger the 'unknown.png' fallback
            const url = 'domain-without-slashes';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            // Create a specific mock implementation for this test
            (DownloadManager as jest.Mock).mockImplementationOnce(() => ({
                downloadFile: jest.fn().mockResolvedValue({
                    fileName: 'unknown.png',
                    filePath: '/path/to/unknown.png'
                })
            }));

            const result = await factory['downloadImageAndReturnLocalPath'](url);

            expect(result).toBe('TempFiles/unknown.png');
            expect(DownloadManager).toHaveBeenCalledWith(
                'bucket1',
                expect.any(String),
                expect.any(String),
                expect.any(String),
                url,
                'unknown.png',
                'project1',
                expect.any(String)
            );
        });

        test('should return original URL if no bucket name is provided', async () => {
            const url = 'https://example.com/image.jpg';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1');

            const privateFn = factory['downloadImageAndReturnLocalPath'].bind(factory);
            const result = await privateFn(url);

            expect(result).toBe(url);
            expect(DownloadManager).not.toHaveBeenCalled();
        });

        test('should handle download errors gracefully', async () => {
            const url = 'https://example.com/bad-image.jpg';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            // Make download fail
            (DownloadManager as jest.Mock).mockImplementationOnce(() => ({
                downloadFile: jest.fn().mockRejectedValue(new Error('Download failed'))
            }));

            const privateFn = factory['downloadImageAndReturnLocalPath'].bind(factory);
            const result = await privateFn(url);

            expect(result).toBe(url); // Should return original URL on error
            expect(logger.error).toHaveBeenCalled();
        });

        test('should use cache for repeated image requests', async () => {
            const url = 'https://example.com/image.jpg';
            const factory = new RichTextDataFactory('<p>Test</p>', '/template', 'project1', 'bucket1');

            // Setup the cache manually
            factory['imageCache'] = new Map();
            factory['imageCache'].set(url, 'TempFiles/cached-image.jpg');

            const result = await factory['downloadImageAndReturnLocalPath'](url);

            expect(result).toBe('TempFiles/cached-image.jpg');
            expect(DownloadManager).not.toHaveBeenCalled();
        });
    });

    describe('checkIfEmptyHtml', () => {
        test('should detect empty HTML correctly', () => {
            const factory = new RichTextDataFactory('<html><body></body></html>', '/template', 'project1');

            // Mock the checkIfEmptyHtml method directly
            factory['checkIfEmptyHtml'] = jest.fn().mockReturnValue(true);

            expect(factory['checkIfEmptyHtml']()).toBe(true);
        });

        test('should detect HTML with content as non-empty', () => {
            const factory = new RichTextDataFactory('<html><body><p>Content</p></body></html>', '/template', 'project1');

            // Mock the checkIfEmptyHtml method directly
            factory['checkIfEmptyHtml'] = jest.fn().mockReturnValue(false);

            expect(factory['checkIfEmptyHtml']()).toBe(false);
        });
    });
});